import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: { rejectUnauthorized: false } }) : null;

const now = () => new Date().toISOString();
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (!values.every(Number.isFinite) || values[0] < -90 || values[0] > 90 || values[2] < -90 || values[2] > 90 || values[1] < -180 || values[1] > 180 || values[3] < -180 || values[3] > 180) return null;
  const [aLat, aLon, bLat, bLon] = values.map((value) => value * Math.PI / 180);
  const a = Math.sin((bLat - aLat) / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin((bLon - aLon) / 2) ** 2;
  return Math.round(6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export class DatabaseRepository {
  constructor() {
    this.ready = Promise.resolve();
  }

  async waitUntilReady() {
    return this;
  }

  async _query(text, values = []) { 
    if (!pool) return { rows: [] }; 
    return pool.query(text, values); 
  }

  async _persistUser(user) {
    await this._query(
      `INSERT INTO users (id, email, username, name, role, organization, supplier_id, telegram_id, full_name, is_active, active, avatar, description, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         active = EXCLUDED.active,
         name = EXCLUDED.name,
         full_name = EXCLUDED.full_name,
         username = EXCLUDED.username,
         supplier_id = EXCLUDED.supplier_id,
         telegram_id = EXCLUDED.telegram_id,
         updated_at = now()`,
      [
        user.id,
        user.email ?? `${user.username || user.id}@seed.local`,
        user.username,
        user.name ?? user.full_name,
        user.role,
        user.organization,
        user.supplier_id,
        user.telegram_id,
        user.full_name,
        user.is_active ?? user.active ?? true,
        user.avatar,
        user.description,
        user.password_hash ?? 'seed-disabled'
      ]
    );
  }

  async _persistReport(r) { 
    await this._query('INSERT INTO reports (id,owner_id,construction_code,status,payload,created_at,captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload', [r.id,r.owner_id ?? r.specialist_id ?? 'system',r.construction_code ?? r.construction_id,r.status,r,r.created_at,r.captured_at]); 
  }

  async deleteReport(id) {
    await this._query('DELETE FROM reports WHERE id = $1', [id]);
  }

  async clearDb() { 
    await Promise.all(['users','suppliers','constructions','reports','import_runs'].map((table) => this._query(`TRUNCATE TABLE ${table}`))); 
  }

  async getUsers() { 
    const res = await this._query('SELECT * FROM users');
    return res.rows;
  }

  async getUserById(id) { 
    const res = await this._query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async getUserByTelegramId(id) { 
    const res = await this._query('SELECT * FROM users WHERE telegram_id = $1', [String(id)]);
    return res.rows[0] || null;
  }

  async saveUser(user) {
    await this._persistUser(user);
    return user;
  }

  async getSuppliers() { 
    const res = await this._query('SELECT * FROM suppliers');
    return res.rows;
  }

  async getSupplierById(id) { 
    const res = await this._query('SELECT * FROM suppliers WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async saveSupplier(supplier) {
    await this._query('INSERT INTO suppliers (id, name, folder_path, inn) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, folder_path=EXCLUDED.folder_path, inn=EXCLUDED.inn', [supplier.id, supplier.name, supplier.folder_path || supplier.folderPath || null, supplier.inn || null]);
  }

  async getConstructions(filters = {}) { 
    let query = 'SELECT * FROM constructions WHERE 1=1';
    let params = [];
    if (filters.supplier_id) { params.push(filters.supplier_id); query += ` AND supplier_id = $${params.length}`; }
    if (filters.month_period) { params.push(filters.month_period); query += ` AND month_period = $${params.length}`; }
    if (filters.code) { params.push(`%${filters.code}%`); query += ` AND code ILIKE $${params.length}`; }
    const res = await this._query(query, params);
    return res.rows;
  }

  async getConstructionById(id) { 
    const res = await this._query('SELECT * FROM constructions WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async getNearbyConstructions({ latitude, longitude, supplier_id = null, month_period = null }) { 
    const constructions = await this.getConstructions({ supplier_id, month_period });
    const suppliers = await this.getSuppliers();
    const reportsRes = await this._query("SELECT id, construction_id FROM reports WHERE status = 'APPROVED'");
    const approvedReports = reportsRes.rows;

    return constructions.map((c) => { 
      const distance = haversineMeters(latitude, longitude, c.latitude, c.longitude); 
      const supplier = suppliers.find(s => s.id === c.supplier_id); 
      const report = approvedReports.find((r) => r.construction_id === c.id); 
      return { 
        ...c, 
        supplier_name: supplier?.name || 'Поставщик', 
        supplier_folder: supplier?.folder_path || 'archive', 
        distance_meters: distance, 
        distance_formatted: distance == null ? 'GPS недоступен' : distance >= 1000 ? `${(distance / 1000).toFixed(1)} км` : `${distance} м`, 
        is_completed: Boolean(report), 
        last_report_id: report?.id || null 
      }; 
    }).sort((a,b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity)); 
  }

  async saveConstructionsBatch({ supplier_id, month_period, constructions }) { 
    if (!pool) return { countAdded: 0, countUpdated: 0, total: 0 };
    const client = await pool.connect();
    let countAdded = 0;
    let countUpdated = 0;
    try {
      await client.query('BEGIN');
      for (const item of constructions) {
        const code = String(item.code).toUpperCase();
        const existingRes = await client.query('SELECT id FROM constructions WHERE supplier_id = $1 AND UPPER(code) = $2 AND side = $3 AND month_period = $4', [supplier_id, code, item.side || 'Сторона А', month_period]);
        const isUpdate = existingRes.rows.length > 0;
        const id = isUpdate ? existingRes.rows[0].id : item.id || `cst_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        
        await client.query(
          `INSERT INTO constructions (id,code,name,supplier_id,type,side,address_location,latitude,longitude,tolerance_meters,ai_criteria,reference_photo_url,month_period,updated_at) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) 
           ON CONFLICT (id) DO UPDATE SET 
           code=EXCLUDED.code,name=EXCLUDED.name,supplier_id=EXCLUDED.supplier_id,type=EXCLUDED.type,side=EXCLUDED.side,address_location=EXCLUDED.address_location,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,tolerance_meters=EXCLUDED.tolerance_meters,ai_criteria=EXCLUDED.ai_criteria,reference_photo_url=EXCLUDED.reference_photo_url,month_period=EXCLUDED.month_period,updated_at=now()`, 
          [id,code,item.type || 'Билборд 3х6 м',supplier_id,item.type || 'Билборд 3х6 м',item.side || 'Сторона А',item.address || item.address_location || 'г. Москва',Number(item.latitude) || null,Number(item.longitude) || null,Number(item.tolerance_meters) || 300,item.ai_criteria || '',item.reference_photo_url || null,month_period]
        );
        if (isUpdate) countUpdated++; else countAdded++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('saveConstructionsBatch transaction failed:', e);
      throw e;
    } finally {
      client.release();
    }
    const totalRes = await this._query('SELECT COUNT(*) as cnt FROM constructions');
    return { countAdded, countUpdated, total: parseInt(totalRes.rows[0].cnt, 10) };
  }

  async getReports(filters = {}) { 
    let query = 'SELECT * FROM reports WHERE 1=1';
    let params = [];
    if (filters.supplier_id) { params.push(filters.supplier_id); query += ` AND payload->>'supplier_id' = $${params.length}`; }
    if (filters.construction_id) { params.push(filters.construction_id); query += ` AND construction_code = $${params.length}`; }
    if (filters.specialist_id) { params.push(filters.specialist_id); query += ` AND payload->>'specialist_id' = $${params.length}`; }
    if (filters.status) { params.push(filters.status); query += ` AND status = $${params.length}`; }
    const res = await this._query(query, params);
    return res.rows.map(r => ({...r, ...(r.payload || {})}));
  }

  async saveReport(data) { 
    const report = { id: data.id || `rep_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...data, created_at: data.created_at || now(), captured_at: data.captured_at || now() }; 
    await this._persistReport(report); 
    return report; 
  }

  async updateReportsBulk(reportIds, status, comment) {
    if (!reportIds || reportIds.length === 0) return 0;
    if (!pool) return 0;
    let count = 0;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const id of reportIds) {
        const res = await client.query('SELECT payload FROM reports WHERE id = $1', [id]);
        if (res.rows.length > 0) {
          let payload = res.rows[0].payload || {};
          payload.status = status;
          if (comment) payload.ai_reasoning = (payload.ai_reasoning ? payload.ai_reasoning + '\\n' : '') + `[Bulk KAM]: ${comment}`;
          await client.query('UPDATE reports SET status = $1, payload = $2 WHERE id = $3', [status, payload, id]);
          count++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Bulk update transaction failed:', e);
      throw e;
    } finally {
      client.release();
    }
    return count;
  }

  async recordImportRun(run) { 
    const record = { id: run.id || `imp_${Date.now()}`, ...run, created_at: run.created_at || now() }; 
    await this._query(
      'INSERT INTO import_runs (id,supplier_id,month_period,file_name,checksum,status,valid_rows,warning_rows,error_rows,preview_rows,committed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,committed_at=EXCLUDED.committed_at,preview_rows=EXCLUDED.preview_rows', 
      [record.id,record.supplier_id,record.month_period,record.file_name || '',record.checksum || '',record.status,record.valid_rows || 0,record.warning_rows || 0,record.error_rows || 0,JSON.stringify(record.preview_rows || []),record.committed_at || null]
    ); 
    return record; 
  }

  async getImportRuns() { 
    const res = await this._query('SELECT * FROM import_runs ORDER BY created_at DESC');
    return res.rows;
  }

  async getSupplierReport(supplierId, period, status) { 
    const supplier = await this.getSupplierById(supplierId); 
    if (!supplier) return null; 
    const constructions = await this.getConstructions({ supplier_id: supplierId, month_period: period }); 
    const ids = new Set(constructions.map((c) => c.id)); 
    
    let reportsQuery = "SELECT * FROM reports WHERE payload->>'supplier_id' = $1";
    let params = [supplierId];
    if (status) { params.push(status); reportsQuery += ' AND status = $2'; }
    
    const reportsRes = await this._query(reportsQuery, params);
    const reports = reportsRes.rows.map(r => ({...r, ...(r.payload||{})})).filter((r) => ids.has(r.construction_id || r.construction_code)); 
    
    const approved = new Set(reports.filter((r) => r.status === 'APPROVED').map((r) => r.construction_id || r.construction_code)); 
    const rejected = new Set(reports.filter((r) => r.status === 'REJECTED').map((r) => r.construction_id || r.construction_code)); 
    return { supplier_id: supplierId, period: period || null, totals: { constructions: constructions.length, reports: reports.length, approved: approved.size, rejected: rejected.size, missing: Math.max(0, constructions.length - approved.size) }, constructions, reports }; 
  }

  async getKamDashboard(monthPeriod = '2026-09') { 
    const suppliers = await this.getSuppliers();
    const constructions = await this.getConstructions({ month_period: monthPeriod });
    const reportsRes = await this._query('SELECT status, construction_code FROM reports');
    const reports = reportsRes.rows;

    return suppliers.map((supplier) => { 
      const supsConstructions = constructions.filter(c => c.supplier_id === supplier.id);
      const ids = new Set(supsConstructions.map((c) => c.id)); 
      const supsReports = reports.filter((r) => ids.has(r.construction_code)); 
      const approved = new Set(supsReports.filter((r) => r.status === 'APPROVED').map((r) => r.construction_code)); 
      const rejected = new Set(supsReports.filter((r) => r.status === 'REJECTED').map((r) => r.construction_code)); 
      return { supplier_id: supplier.id, supplier_name: supplier.name, folder_path: supplier.folder_path, month_period: monthPeriod, total_planned: supsConstructions.length, approved_count: approved.size, rejected_count: rejected.size, progress_text: `Сдано ${approved.size}/${supsConstructions.length} отчетов`, progress_percent: supsConstructions.length ? Math.round(approved.size / supsConstructions.length * 100) : 0, is_completed: supsConstructions.length > 0 && approved.size >= supsConstructions.length }; 
    }); 
  }
}

export const databaseRepository = new DatabaseRepository();
export { pool };
