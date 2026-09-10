import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'sdip_relational_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Haversine distance calculator in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999999;
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Initial seed data reflecting the 4 core relational tables
const DEFAULT_DB = {
  suppliers: [
    {
      id: 'sup_01',
      name: 'ООО «МедиаАутдор Групп»',
      folder_path: 'ООО_МедиаАутдор_Групп',
      inn: '7701928341',
      contact_email: 'info@mediaoutdoor.ru',
      created_at: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'sup_02',
      name: 'ООО «Русс Аутдор Монтаж»',
      folder_path: 'ООО_Русс_Аутдор_Монтаж',
      inn: '7722334455',
      contact_email: 'ops@russoutdoor.ru',
      created_at: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'sup_03',
      name: 'АО «Мособлреклама»',
      folder_path: 'АО_Мособлреклама',
      inn: '5001239874',
      contact_email: 'service@mosoblrek.ru',
      created_at: '2026-09-01T00:00:00.000Z'
    }
  ],
  users: [
    {
      id: 'usr_kam_01',
      telegram_id: 10001,
      username: 'kam_elena',
      full_name: 'Елена Соколова',
      role: 'KAM',
      supplier_id: 'sup_01',
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'usr_spec_01',
      telegram_id: 20001,
      username: 'spec_abdulaziz',
      full_name: 'Абдулазиз Каримов',
      role: 'Specialist',
      supplier_id: 'sup_01',
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'usr_spec_02',
      telegram_id: 20002,
      username: 'spec_mikhail',
      full_name: 'Михаил Воронов',
      role: 'Specialist',
      supplier_id: 'sup_02',
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'usr_admin_01',
      telegram_id: 99999,
      username: 'admin_root',
      full_name: 'Главный Аудитор OOH',
      role: 'Admin',
      supplier_id: null,
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z'
    }
  ],
  constructions: [
    {
      id: 'cst_01',
      supplier_id: 'sup_01',
      code: 'BB-MOW-0104',
      type: 'Билборд 3х6 м',
      side: 'Сторона А',
      address_location: 'г. Москва, Ленинградский пр-кт, 37 к2',
      latitude: 55.7928,
      longitude: 37.5432,
      tolerance_meters: 250,
      ai_criteria: 'Фронтальный план (отклонение до 15°), 100% читаемость баннера СБЕР, отсутствие веток деревьев, работающая LED-подсветка.',
      reference_photo_url: '/storage/ООО_МедиаАутдор_Групп/2026-09/ref_BB-MOW-0104.jpg',
      month_period: '2026-09',
      created_at: '2026-09-01T08:00:00.000Z'
    },
    {
      id: 'cst_02',
      supplier_id: 'sup_01',
      code: 'SS-MOW-0042',
      type: 'Суперсайт 15х5 м',
      side: 'Сторона А',
      address_location: 'г. Москва, МКАД 68-й км, внешняя сторона',
      latitude: 55.8451,
      longitude: 37.3820,
      tolerance_meters: 400,
      ai_criteria: 'Широкоугольный ракурс по ходу движения, видимость всего полотна без бликов, отсутствие складок монтажа.',
      reference_photo_url: '/storage/ООО_МедиаАутдор_Групп/2026-09/ref_SS-MOW-0042.jpg',
      month_period: '2026-09',
      created_at: '2026-09-01T08:00:00.000Z'
    },
    {
      id: 'cst_03',
      supplier_id: 'sup_01',
      code: 'CB-MOW-0219',
      type: 'Сити-борд 3.7х2.7 м',
      side: 'Сторона Б',
      address_location: 'г. Москва, Кутузовский пр-кт, 22',
      latitude: 55.7483,
      longitude: 37.5385,
      tolerance_meters: 150,
      ai_criteria: 'Пешеходная перспектива, чистота стекла роллерного короба, ровное натяжение постера.',
      reference_photo_url: null,
      month_period: '2026-09',
      created_at: '2026-09-01T08:00:00.000Z'
    },
    {
      id: 'cst_04',
      supplier_id: 'sup_02',
      code: 'BB-MOW-0588',
      type: 'Билборд 3х6 м',
      side: 'Сторона А',
      address_location: 'г. Москва, пр-кт Мира, 119 стр 1',
      latitude: 55.8263,
      longitude: 37.6375,
      tolerance_meters: 250,
      ai_criteria: 'Фронтальная видимость полотна, чистый баннер, отсутствие снега/грязи на нижнем торце.',
      reference_photo_url: null,
      month_period: '2026-09',
      created_at: '2026-09-01T08:00:00.000Z'
    }
  ],
  reports: [
    {
      id: 'rep_01',
      construction_id: 'cst_01',
      specialist_id: 'usr_spec_01',
      supplier_id: 'sup_01',
      photo_url: '/storage/ООО_МедиаАутдор_Групп/2026-09/BB-MOW-0104_Сторона_А.jpg',
      raw_photo_url: null,
      gps_lat: 55.7928,
      gps_lon: 37.5432,
      geo_distance_meters: 12,
      status: 'APPROVED',
      confidence_score: 0.98,
      ai_reasoning: 'Конструкция соответствует эталонному ТЗ: рекламное поле читаемо, дефектов монтажа и повреждений не обнаружено.',
      detected_issues: [],
      stamp_hash: 'OOH-1725888000000-8F92A14B',
      capture_source: 'live_camera_stream',
      captured_at: '2026-09-08T11:45:00.000Z',
      created_at: '2026-09-08T11:45:05.000Z'
    }
  ]
};

export class DatabaseRepository {
  constructor() {
    this._ensureInitialized();
  }

  _ensureInitialized() {
    if (!fs.existsSync(DB_FILE)) {
      this._writeDb(DEFAULT_DB);
    }
  }

  _readDb() {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return DEFAULT_DB;
    }
  }

  _writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // --- 1. USERS ---
  getUsers() {
    return this._readDb().users || [];
  }

  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  }

  getUserByTelegramId(telegramId) {
    const tid = Number(telegramId);
    return this.getUsers().find(u => Number(u.telegram_id) === tid) || null;
  }

  // --- 2. SUPPLIERS ---
  getSuppliers() {
    return this._readDb().suppliers || [];
  }

  getSupplierById(id) {
    return this.getSuppliers().find(s => s.id === id) || null;
  }

  // --- 3. CONSTRUCTIONS ---
  getConstructions(filters = {}) {
    let list = this._readDb().constructions || [];
    if (filters.supplier_id) {
      list = list.filter(c => c.supplier_id === filters.supplier_id);
    }
    if (filters.month_period) {
      list = list.filter(c => c.month_period === filters.month_period);
    }
    if (filters.code) {
      list = list.filter(c => c.code.toLowerCase().includes(filters.code.toLowerCase()));
    }
    return list;
  }

  getConstructionById(id) {
    return (this._readDb().constructions || []).find(c => c.id === id) || null;
  }

  getNearbyConstructions({ latitude, longitude, supplier_id = null, maxDistanceMeters = 50000 }) {
    const db = this._readDb();
    let constructions = db.constructions || [];

    if (supplier_id) {
      constructions = constructions.filter(c => c.supplier_id === supplier_id);
    }

    const suppliersMap = new Map((db.suppliers || []).map(s => [s.id, s]));
    const reports = db.reports || [];

    const result = constructions.map(c => {
      const dist = haversineMeters(latitude, longitude, c.latitude, c.longitude);
      const supplier = suppliersMap.get(c.supplier_id);

      // Check if already reported this month
      const existingReport = reports.find(
        r => r.construction_id === c.id && r.status === 'APPROVED'
      );

      return {
        ...c,
        supplier_name: supplier ? supplier.name : 'Поставщик',
        supplier_folder: supplier ? supplier.folder_path : 'archive',
        distance_meters: dist,
        distance_formatted: dist >= 1000 ? `${(dist / 1000).toFixed(1)} км` : `${dist} м`,
        is_completed: Boolean(existingReport),
        last_report_id: existingReport ? existingReport.id : null
      };
    });

    // Sort by distance ascending (nearest first)
    result.sort((a, b) => a.distance_meters - b.distance_meters);
    return result;
  }

  saveConstructionsBatch({ supplier_id, month_period, constructions, defaultCriteria = '' }) {
    const db = this._readDb();
    let countAdded = 0;
    let countUpdated = 0;

    constructions.forEach(item => {
      const existingIndex = db.constructions.findIndex(
        c => c.supplier_id === supplier_id &&
             c.code.toUpperCase() === item.code.toUpperCase() &&
             c.side === item.side &&
             c.month_period === month_period
      );

      const record = {
        id: item.id || `cst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        supplier_id,
        code: item.code.toUpperCase(),
        type: item.type || 'Билборд 3х6 м',
        side: item.side || 'Сторона А',
        address_location: item.address || item.address_location || 'г. Москва',
        latitude: Number(item.latitude) || 55.751244,
        longitude: Number(item.longitude) || 37.618423,
        tolerance_meters: Number(item.tolerance_meters) || 300,
        ai_criteria: item.ai_criteria || defaultCriteria || '100% читаемость, отсутствие перекрытий, чистый постер.',
        reference_photo_url: item.reference_photo_url || null,
        month_period: month_period || '2026-09',
        updated_at: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        db.constructions[existingIndex] = {
          ...db.constructions[existingIndex],
          ...record,
          id: db.constructions[existingIndex].id
        };
        countUpdated++;
      } else {
        record.created_at = new Date().toISOString();
        db.constructions.push(record);
        countAdded++;
      }
    });

    this._writeDb(db);
    return { countAdded, countUpdated, total: db.constructions.length };
  }

  // --- 4. REPORTS ---
  getReports(filters = {}) {
    let list = this._readDb().reports || [];
    if (filters.supplier_id) {
      list = list.filter(r => r.supplier_id === filters.supplier_id);
    }
    if (filters.construction_id) {
      list = list.filter(r => r.construction_id === filters.construction_id);
    }
    if (filters.specialist_id) {
      list = list.filter(r => r.specialist_id === filters.specialist_id);
    }
    if (filters.status) {
      list = list.filter(r => r.status === filters.status);
    }
    return list;
  }

  saveReport(reportData) {
    const db = this._readDb();
    const newReport = {
      id: reportData.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      construction_id: reportData.construction_id,
      specialist_id: reportData.specialist_id,
      supplier_id: reportData.supplier_id,
      photo_url: reportData.photo_url,
      raw_photo_url: reportData.raw_photo_url || null,
      gps_lat: Number(reportData.gps_lat),
      gps_lon: Number(reportData.gps_lon),
      geo_distance_meters: Number(reportData.geo_distance_meters) || 0,
      status: reportData.status || 'PENDING',
      confidence_score: Number(reportData.confidence_score) || 0,
      ai_reasoning: reportData.ai_reasoning || '',
      detected_issues: reportData.detected_issues || [],
      stamp_hash: reportData.stamp_hash || 'OOH-STAMP',
      capture_source: reportData.capture_source || 'live_camera_stream',
      captured_at: reportData.captured_at || new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    db.reports.unshift(newReport);
    this._writeDb(db);
    return newReport;
  }

  // --- 5. KAM DASHBOARD AGGREGATES ---
  getKamDashboard(monthPeriod = '2026-09') {
    const db = this._readDb();
    const suppliers = db.suppliers || [];
    const constructions = db.constructions || [];
    const reports = db.reports || [];

    return suppliers.map(supplier => {
      const supplierConstructions = constructions.filter(
        c => c.supplier_id === supplier.id && (!monthPeriod || c.month_period === monthPeriod)
      );
      const totalPlanned = supplierConstructions.length;

      const constructionIds = new Set(supplierConstructions.map(c => c.id));
      const submittedReports = reports.filter(r => constructionIds.has(r.construction_id));

      const approvedCount = submittedReports.filter(r => r.status === 'APPROVED').length;
      const rejectedCount = submittedReports.filter(r => r.status === 'REJECTED').length;
      const progressPercent = totalPlanned > 0 ? Math.round((approvedCount / totalPlanned) * 100) : 0;

      return {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        folder_path: supplier.folder_path,
        month_period: monthPeriod,
        total_planned: totalPlanned,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        progress_text: `Сдано ${approvedCount}/${totalPlanned} отчетов`,
        progress_percent: progressPercent,
        is_completed: totalPlanned > 0 && approvedCount >= totalPlanned
      };
    });
  }
}

export const databaseRepository = new DatabaseRepository();
