import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } }) : null;

const readJson = (name, fallback = []) => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
};
const now = () => new Date().toISOString();
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite) || values[0] < -90 || values[0] > 90 || values[2] < -90 || values[2] > 90 || values[1] < -180 || values[1] > 180 || values[3] < -180 || values[3] > 180) return null;
  const [aLat, aLon, bLat, bLon] = values.map((value) => value * Math.PI / 180);
  const a = Math.sin((bLat - aLat) / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin((bLon - aLon) / 2) ** 2;
  return Math.round(6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const seedUsers = readJson('users.json').map((user) => ({
  ...user, telegram_id: user.telegram_id ?? (user.telegramUser?.replace(/\D/g, '') || null),
  full_name: user.full_name ?? user.name, supplier_id: user.supplier_id ?? user.contractorId ?? null,
  is_active: user.is_active ?? user.active ?? true, email: user.email ?? `${user.username || user.id}@seed.local`,
  password_hash: user.password_hash ?? 'seed-disabled'
}));
const seedReports = readJson('reports.json').map((report, index) => ({
  id: report.id || `rep_seed_${index}`, construction_id: report.construction_id ?? report.construction?.code ?? null,
  specialist_id: report.specialist_id ?? null, supplier_id: report.supplier_id ?? report.contractor?.id ?? null,
  photo_url: report.photo_url ?? report.photoUrl ?? null, raw_photo_url: report.raw_photo_url ?? null,
  gps_lat: report.gps_lat ?? report.location?.latitude ?? null, gps_lon: report.gps_lon ?? report.location?.longitude ?? null,
  status: report.status ?? report.verificationStatus?.toUpperCase() ?? 'PENDING', confidence_score: report.confidence_score ?? 0,
  ai_reasoning: report.ai_reasoning ?? report.defectDetails ?? '', detected_issues: report.detected_issues ?? [],
  stamp_hash: report.stamp_hash ?? report.stampHash ?? null, capture_source: report.capture_source ?? report.captureSource ?? 'seed',
  captured_at: report.captured_at ?? now(), created_at: report.created_at ?? now(), payload: report
}));
const seedSuppliers = [
  ['sup_01', 'ООО «МедиаАутдор Групп»', '7701928341'],
  ['sup_02', 'ООО «Русс Аутдор Монтаж»', '7722334455'],
  ['sup_03', 'АО «Мособлреклама»', '5001239874']
].map(([id, name, inn]) => ({ id, name, inn, folder_path: name.replaceAll('«', '').replaceAll('»', '').replaceAll(' ', '_'), active: true }));
const seedConstructions = [
  ['cst_01', 'sup_01', 'BB-MOW-0104', 'Билборд 3х6 м', 'Сторона А', 'г. Москва, Ленинградский пр-кт, 37 к2', 55.7928, 37.5432],
  ['cst_02', 'sup_01', 'SS-MOW-0042', 'Суперсайт 15х5 м', 'Сторона А', 'г. Москва, МКАД 68-й км, внешняя сторона', 55.8451, 37.382],
  ['cst_03', 'sup_01', 'CB-MOW-0219', 'Сити-борд 3.7х2.7 м', 'Сторона Б', 'г. Москва, Кутузовский пр-кт, 22', 55.7483, 37.5385],
  ['cst_04', 'sup_02', 'BB-MOW-0588', 'Билборд 3х6 м', 'Сторона А', 'г. Москва, пр-кт Мира, 119 стр 1', 55.8263, 37.6375]
].map(([id, supplier_id, code, type, side, address_location, latitude, longitude]) => ({ id, supplier_id, code, type, side, address_location, latitude, longitude, tolerance_meters: 300, month_period: '2026-09' }));

export class DatabaseRepository {
  constructor() {
    this.cache = { users: seedUsers, suppliers: seedSuppliers, constructions: seedConstructions, reports: seedReports, import_runs: [] };
    this.ready = this._hydrate();
  }

  async waitUntilReady() {
    await this.ready;
    return this;
  }
  _readDb() { return this.cache; }
  _writeDb(data) { this.cache = data; return data; }
  async _query(text, values = []) { if (!pool) return null; return pool.query(text, values); }
  async _hydrate() {
    if (!pool) return;
    try {
      const [users, suppliers, constructions, reports, imports] = await Promise.all([
        pool.query('SELECT id, email, username, name, role, organization, supplier_id, telegram_id, full_name, is_active, active, avatar, description, password_hash FROM users'),
        pool.query('SELECT id, name, inn, folder_path, contact_email, phone, telegram, active, created_at FROM suppliers'),
        pool.query('SELECT id, supplier_id, code, type, side, address_location, latitude, longitude, tolerance_meters, ai_criteria, reference_photo_url, month_period, status, created_at, updated_at FROM constructions'),
        pool.query('SELECT id, owner_id, construction_code, status, payload, created_at, captured_at FROM reports ORDER BY created_at DESC'),
        pool.query('SELECT * FROM import_runs ORDER BY created_at DESC')
      ]);
      if (users.rows.length || suppliers.rows.length || constructions.rows.length || reports.rows.length) {
        this.cache = { users: users.rows, suppliers: suppliers.rows, constructions: constructions.rows, reports: reports.rows.map((row) => ({ ...row, ...(row.payload || {}) })), import_runs: imports.rows };
      } else {
        await this._seed();
      }
    } catch (error) { console.error('[v0] Neon hydrate failed:', error.message); }
  }
  async _seed() {
    for (const user of this.cache.users) await this._query('INSERT INTO users (id,email,username,name,role,organization,supplier_id,telegram_id,full_name,is_active,active,avatar,description,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING', [user.id,user.email,user.username,user.name,user.role,user.organization,user.supplier_id,user.telegram_id,user.full_name,user.is_active,user.avatar,user.description,user.password_hash]);
    for (const supplier of this.cache.suppliers) await this._query('INSERT INTO suppliers (id,name,inn,folder_path,active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING', [supplier.id,supplier.name,supplier.inn,supplier.folder_path,supplier.active]);
    for (const c of this.cache.constructions) await this._query('INSERT INTO constructions (id,code,name,supplier_id,type,side,address_location,latitude,longitude,tolerance_meters,month_period) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING', [c.id,c.code,c.type,c.supplier_id,c.type,c.side,c.address_location,c.latitude,c.longitude,c.tolerance_meters,c.month_period]);
    for (const r of this.cache.reports) await this._persistReport(r);
  }
  async _persistUser(user) { await this._query('INSERT INTO users (id,email,username,name,role,organization,supplier_id,telegram_id,full_name,is_active,active,avatar,description,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13) ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role,is_active=EXCLUDED.is_active,active=EXCLUDED.active,name=EXCLUDED.name', [user.id,user.email ?? `${user.username || user.id}@seed.local`,user.username,user.name ?? user.full_name,user.role,user.organization,user.supplier_id,user.telegram_id,user.full_name,user.is_active ?? user.active ?? true,user.avatar,user.description,user.password_hash ?? 'seed-disabled']); }
  async _persistReport(r) { await this._query('INSERT INTO reports (id,owner_id,construction_code,status,payload,created_at,captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING', [r.id,r.owner_id ?? r.specialist_id ?? 'system',r.construction_code ?? r.construction_id,r.status,r,r.created_at,r.captured_at]); }
  clearDb() { this.cache = { users: [], suppliers: [], constructions: [], reports: [], import_runs: [] }; void Promise.all(['users','suppliers','constructions','reports','import_runs'].map((table) => this._query(`TRUNCATE TABLE ${table}`))); return this.cache; }
  getUsers() { return this.cache.users; }
  getUserById(id) { return this.cache.users.find((u) => u.id === id) || null; }
  getUserByTelegramId(id) { return this.cache.users.find((u) => String(u.telegram_id) === String(id)) || null; }
  saveUser(user) { const index = this.cache.users.findIndex((u) => u.id === user.id); if (index >= 0) this.cache.users[index] = user; else this.cache.users.push(user); void this._persistUser(user); return user; }
  getSuppliers() { return this.cache.suppliers; }
  getSupplierById(id) { return this.cache.suppliers.find((s) => s.id === id) || null; }
  getConstructions(filters = {}) { return this.cache.constructions.filter((c) => (!filters.supplier_id || c.supplier_id === filters.supplier_id) && (!filters.month_period || c.month_period === filters.month_period) && (!filters.code || c.code.toLowerCase().includes(filters.code.toLowerCase()))); }
  getConstructionById(id) { return this.cache.constructions.find((c) => c.id === id) || null; }
  getNearbyConstructions({ latitude, longitude, supplier_id = null, month_period = null }) { return this.getConstructions({ supplier_id, month_period }).map((c) => { const distance = haversineMeters(latitude, longitude, c.latitude, c.longitude); const supplier = this.getSupplierById(c.supplier_id); const report = this.cache.reports.find((r) => r.construction_id === c.id && r.status === 'APPROVED'); return { ...c, supplier_name: supplier?.name || 'Поставщик', supplier_folder: supplier?.folder_path || 'archive', distance_meters: distance, distance_formatted: distance == null ? 'GPS недоступен' : distance >= 1000 ? `${(distance / 1000).toFixed(1)} км` : `${distance} м`, is_completed: Boolean(report), last_report_id: report?.id || null }; }).sort((a,b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity)); }
  saveConstructionsBatch({ supplier_id, month_period, constructions }) { let countAdded = 0; let countUpdated = 0; for (const item of constructions) { const existing = this.cache.constructions.find((c) => c.supplier_id === supplier_id && c.code.toUpperCase() === String(item.code).toUpperCase() && c.side === item.side && c.month_period === month_period); const record = { id: existing?.id || item.id || `cst_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, supplier_id, code: String(item.code).toUpperCase(), type: item.type || 'Билборд 3х6 м', side: item.side || 'Сторона А', address_location: item.address || item.address_location || 'г. Москва', latitude: Number(item.latitude) || null, longitude: Number(item.longitude) || null, tolerance_meters: Number(item.tolerance_meters) || 300, ai_criteria: item.ai_criteria || '', reference_photo_url: item.reference_photo_url || null, month_period }; if (existing) { Object.assign(existing, record); countUpdated++; } else { this.cache.constructions.push(record); countAdded++; } void this._query('INSERT INTO constructions (id,code,name,supplier_id,type,side,address_location,latitude,longitude,tolerance_meters,ai_criteria,reference_photo_url,month_period,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,supplier_id=EXCLUDED.supplier_id,type=EXCLUDED.type,side=EXCLUDED.side,address_location=EXCLUDED.address_location,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,tolerance_meters=EXCLUDED.tolerance_meters,ai_criteria=EXCLUDED.ai_criteria,reference_photo_url=EXCLUDED.reference_photo_url,month_period=EXCLUDED.month_period,updated_at=now()', [record.id,record.code,record.type,record.supplier_id,record.type,record.side,record.address_location,record.latitude,record.longitude,record.tolerance_meters,record.ai_criteria,record.reference_photo_url,record.month_period]); } return { countAdded, countUpdated, total: this.cache.constructions.length }; }
  getReports(filters = {}) { return this.cache.reports.filter((r) => (!filters.supplier_id || r.supplier_id === filters.supplier_id) && (!filters.construction_id || r.construction_id === filters.construction_id) && (!filters.specialist_id || r.specialist_id === filters.specialist_id) && (!filters.status || r.status === filters.status)); }
  saveReport(data) { const duplicate = this.cache.reports.find((r) => r.id === data.id || (data.stamp_hash && r.stamp_hash === data.stamp_hash)); if (duplicate) return duplicate; const report = { id: data.id || `rep_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...data, created_at: data.created_at || now(), captured_at: data.captured_at || now() }; this.cache.reports.unshift(report); void this._persistReport(report); return report; }
  recordImportRun(run) { const record = { id: run.id || `imp_${Date.now()}`, ...run, created_at: run.created_at || now() }; const index = this.cache.import_runs.findIndex((item) => item.id === record.id); if (index >= 0) this.cache.import_runs[index] = record; else this.cache.import_runs.unshift(record); void this._query('INSERT INTO import_runs (id,supplier_id,month_period,file_name,checksum,status,valid_rows,warning_rows,error_rows,preview_rows,committed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,committed_at=EXCLUDED.committed_at,preview_rows=EXCLUDED.preview_rows', [record.id,record.supplier_id,record.month_period,record.file_name || '',record.checksum || '',record.status,record.valid_rows || 0,record.warning_rows || 0,record.error_rows || 0,JSON.stringify(record.preview_rows || []),record.committed_at || null]); return record; }
  getImportRuns() { return this.cache.import_runs; }
  getSupplierReport(supplierId, period, status) { const supplier = this.getSupplierById(supplierId); if (!supplier) return null; const constructions = this.getConstructions({ supplier_id: supplierId, month_period: period }); const ids = new Set(constructions.map((c) => c.id)); const reports = this.getReports({ status }).filter((r) => ids.has(r.construction_id)); const approved = new Set(reports.filter((r) => r.status === 'APPROVED').map((r) => r.construction_id)); const rejected = new Set(reports.filter((r) => r.status === 'REJECTED').map((r) => r.construction_id)); return { supplier_id: supplierId, period: period || null, totals: { constructions: constructions.length, reports: reports.length, approved: approved.size, rejected: rejected.size, missing: Math.max(0, constructions.length - approved.size) }, constructions, reports }; }
  getKamDashboard(monthPeriod = '2026-09') { return this.getSuppliers().map((supplier) => { const constructions = this.getConstructions({ supplier_id: supplier.id, month_period: monthPeriod }); const ids = new Set(constructions.map((c) => c.id)); const reports = this.getReports().filter((r) => ids.has(r.construction_id)); const approved = new Set(reports.filter((r) => r.status === 'APPROVED').map((r) => r.construction_id)); const rejected = new Set(reports.filter((r) => r.status === 'REJECTED').map((r) => r.construction_id)); return { supplier_id: supplier.id, supplier_name: supplier.name, folder_path: supplier.folder_path, month_period: monthPeriod, total_planned: constructions.length, approved_count: approved.size, rejected_count: rejected.size, progress_text: `Сдано ${approved.size}/${constructions.length} отчетов`, progress_percent: constructions.length ? Math.round(approved.size / constructions.length * 100) : 0, is_completed: constructions.length > 0 && approved.size >= constructions.length }; }); }
}

export const databaseRepository = new DatabaseRepository();
export { pool };
