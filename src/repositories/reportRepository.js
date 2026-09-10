import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? '/tmp/data' : path.resolve(__dirname, '../../data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const CONTRACTORS_FILE = path.join(DATA_DIR, 'contractors.json');
const CONSTRUCTIONS_FILE = path.join(DATA_DIR, 'constructions.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed users: 1 unified Master Admin + individual Contractor profiles
const INITIAL_USERS = [
  {
    id: "usr_admin",
    username: "admin",
    name: "Главный Администратор OOH",
    role: "admin",
    organization: "Единый Центр Мониторинга и Аудита OOH",
    inn: "7700000001",
    phone: "+7 (800) 555-35-35",
    telegramUser: "@ooh_master_admin",
    active: true,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    description: "Единый наблюдатель: полный аудит всех подрядчиков, конструкций, проверка и редактирование значений отчетов."
  },
  {
    id: "usr_cnt_01",
    username: "abdulaziz",
    name: "Абдулазиз Каримов",
    role: "contractor",
    contractorId: "cnt_01",
    organization: "ООО «МедиаАутдор Групп»",
    inn: "7701928341",
    phone: "+7 (999) 450-88-21",
    telegramUser: "@ooh_abdulaziz",
    active: true,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    description: "Монтажная служба САО/СЗАО Москвы"
  },
  {
    id: "usr_cnt_02",
    username: "voronov",
    name: "Михаил Воронов",
    role: "contractor",
    contractorId: "cnt_02",
    organization: "ООО «Русс Аутдор Монтаж»",
    inn: "7722334455",
    phone: "+7 (916) 123-45-67",
    telegramUser: "@voronov_m",
    active: true,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    description: "Монтажная бригада суперсайтов и МКАД"
  },
  {
    id: "usr_cnt_03",
    username: "smirnov",
    name: "Алексей Смирнов",
    role: "contractor",
    contractorId: "cnt_03",
    organization: "ИП «Смирнов Наружная Реклама»",
    inn: "773344556677",
    phone: "+7 (926) 987-65-43",
    telegramUser: "@smirnov_outdoor",
    active: true,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
    description: "Билборды и ситиборды Западного округа"
  },
  {
    id: "usr_cnt_04",
    username: "seleznev",
    name: "Дмитрий Селезнев",
    role: "contractor",
    contractorId: "cnt_04",
    organization: "АО «Городской Формат Про»",
    inn: "7711223344",
    phone: "+7 (903) 555-77-88",
    telegramUser: "@seleznev_ooh",
    active: true,
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80",
    description: "Монтажная служба Санкт-Петербург и Северо-Запад"
  }
];

// Initial seed contractors
const INITIAL_CONTRACTORS = [
  {
    id: "cnt_01",
    name: "ООО «МедиаАутдор Групп»",
    inn: "7701928341",
    representative: "Абдулазиз Каримов",
    phone: "+7 (999) 450-88-21",
    telegramUser: "@ooh_abdulaziz"
  },
  {
    id: "cnt_02",
    name: "ООО «Русс Аутдор Монтаж»",
    inn: "7722334455",
    representative: "Михаил Воронов",
    phone: "+7 (916) 123-45-67",
    telegramUser: "@voronov_m"
  },
  {
    id: "cnt_03",
    name: "ИП «Смирнов Наружная Реклама»",
    inn: "773344556677",
    representative: "Алексей Смирнов",
    phone: "+7 (926) 987-65-43",
    telegramUser: "@smirnov_outdoor"
  },
  {
    id: "cnt_04",
    name: "АО «Городской Формат Про»",
    inn: "7711223344",
    representative: "Дмитрий Селезнев",
    phone: "+7 (903) 555-77-88",
    telegramUser: "@seleznev_ooh"
  }
];

// Initial seed constructions catalog
const INITIAL_CONSTRUCTIONS = [
  {
    code: "BB-MOW-0104",
    type: "Билборд 3х6 м",
    city: "Москва",
    address: "Ленинградский пр-кт, 37 к2",
    district: "САО",
    side: "Сторона А (в центр)",
    formatSize: "3.0 x 6.0 м",
    lightingType: "LED прожекторы",
    latitude: 55.7928,
    longitude: 37.5432
  },
  {
    code: "SS-MOW-0042",
    type: "Суперсайт 15х5 м",
    city: "Москва",
    address: "МКАД 68-й км, внешняя сторона",
    district: "СЗАО",
    side: "Сторона А (по ходу)",
    formatSize: "15.0 x 5.0 м",
    lightingType: "Внешняя заливающая",
    latitude: 55.8451,
    longitude: 37.3820
  },
  {
    code: "CB-MOW-0219",
    type: "Сити-борд 3.7х2.7 м",
    city: "Москва",
    address: "Кутузовский пр-кт, 22",
    district: "ЗАО",
    side: "Сторона Б (из центра)",
    formatSize: "3.7 x 2.7 м",
    lightingType: "Внутренняя динамическая",
    latitude: 55.7449,
    longitude: 37.5458
  },
  {
    code: "DS-SPB-0081",
    type: "Цифровой экран (DOOH)",
    city: "Санкт-Петербург",
    address: "Невский пр-кт, 114",
    district: "Центральный",
    side: "Экран №1 (к площади Восстания)",
    formatSize: "6.0 x 3.0 м",
    lightingType: "P3.9 Digital LED",
    latitude: 59.9312,
    longitude: 30.3601
  },
  {
    code: "CF-TAS-0015",
    type: "Сити-формат 1.2х1.8 м",
    city: "Ташкент",
    address: "ул. Амира Темура, 45",
    district: "Юнусабадский",
    side: "Сторона А (остановка)",
    formatSize: "1.2 x 1.8 м",
    lightingType: "LED световой короб",
    latitude: 41.3285,
    longitude: 69.2811
  }
];

// Seed reports strictly ordered by:
// 1. Поставщик, 2. Локация, 3. Конструкция, 4. Дата и время
const INITIAL_REPORTS = [
  {
    id: "rep_20260908_001",
    contractor: {
      id: "cnt_01",
      name: "ООО «МедиаАутдор Групп»",
      inn: "7701928341",
      representative: "Абдулазиз Каримов",
      phone: "+7 (999) 450-88-21",
      telegramUser: "@ooh_abdulaziz"
    },
    location: {
      city: "Москва",
      district: "САО",
      address: "Ленинградский пр-кт, 37 к2",
      landmark: "пересечение с ТТК, по направлению в центр",
      latitude: 55.7928,
      longitude: 37.5432,
      geoAccuracyMeters: 4.2
    },
    construction: {
      code: "BB-MOW-0104",
      type: "Билборд 3х6 м",
      side: "Сторона А (в центр)",
      formatSize: "3.0 x 6.0 м",
      lightingType: "LED прожекторы"
    },
    timestamp: "2026-09-08T18:45:12.000Z",
    displayDate: "08.09.2026",
    displayTime: "21:45:12",
    campaignName: "Яндекс Маркет — Осенний Фестиваль Скидок",
    status: "mounted",
    defectDetails: "Полотно натянуто без складок, люверсы закреплены, подсветка проверена",
    photos: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80"
    ],
    verificationStatus: "verified",
    verifiedBy: "Контролер качества Кузнецов Е.",
    verifiedAt: "2026-09-08T19:10:00.000Z",
    notes: "Монтаж завершен в срок. Фотоотчет дневной и ночной приложен.",
    source: "telegram_web_app"
  },
  {
    id: "rep_20260908_002",
    contractor: {
      id: "cnt_01",
      name: "ООО «МедиаАутдор Групп»",
      inn: "7701928341",
      representative: "Абдулазиз Каримов",
      phone: "+7 (999) 450-88-21",
      telegramUser: "@ooh_abdulaziz"
    },
    location: {
      city: "Москва",
      district: "СЗАО",
      address: "МКАД 68-й км, внешняя сторона",
      landmark: "съезд на Волоколамское шоссе",
      latitude: 55.8451,
      longitude: 37.3820,
      geoAccuracyMeters: 6.1
    },
    construction: {
      code: "SS-MOW-0042",
      type: "Суперсайт 15х5 м",
      side: "Сторона А (по ходу)",
      formatSize: "15.0 x 5.0 м",
      lightingType: "Внешняя заливающая"
    },
    timestamp: "2026-09-08T22:15:30.000Z",
    displayDate: "09.09.2026",
    displayTime: "01:15:30",
    campaignName: "Сбер — Кредит для Бизнеса 2026",
    status: "illumination_ok",
    defectDetails: "Подсветка 100% исправна, баннер смонтирован с автовышки",
    photos: [
      "https://images.unsplash.com/photo-1572021335469-31706a17aaef?auto=format&fit=crop&w=800&q=80"
    ],
    verificationStatus: "verified",
    verifiedBy: "Автоматический аудит",
    verifiedAt: "2026-09-08T22:30:00.000Z",
    notes: "Ночная инспекция освещения пройдена успешно.",
    source: "telegram_web_app"
  },
  {
    id: "rep_20260909_001",
    contractor: {
      id: "cnt_02",
      name: "ООО «Русс Аутдор Монтаж»",
      inn: "7722334455",
      representative: "Михаил Воронов",
      phone: "+7 (916) 123-45-67",
      telegramUser: "@voronov_m"
    },
    location: {
      city: "Москва",
      district: "ЗАО",
      address: "Кутузовский пр-кт, 22",
      landmark: "напротив отеля Рэдиссон Славянская",
      latitude: 55.7449,
      longitude: 37.5458,
      geoAccuracyMeters: 3.8
    },
    construction: {
      code: "CB-MOW-0219",
      type: "Сити-борд 3.7х2.7 м",
      side: "Сторона Б (из центра)",
      formatSize: "3.7 x 2.7 м",
      lightingType: "Внутренняя динамическая"
    },
    timestamp: "2026-09-09T05:30:00.000Z",
    displayDate: "09.09.2026",
    displayTime: "08:30:00",
    campaignName: "Альфа-Банк — Премиум Инвестиции",
    status: "mounted",
    defectDetails: "Монтаж скроллерной бумаги выполнен. Механизм прокрутки протестирован",
    photos: [
      "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80"
    ],
    verificationStatus: "pending",
    notes: "Ожидает подтверждения куратором направления",
    source: "telegram_web_app"
  },
  {
    id: "rep_20260909_002",
    contractor: {
      id: "cnt_03",
      name: "ИП «Смирнов Наружная Реклама»",
      inn: "773344556677",
      representative: "Алексей Смирнов",
      phone: "+7 (926) 987-65-43",
      telegramUser: "@smirnov_outdoor"
    },
    location: {
      city: "Санкт-Петербург",
      district: "Центральный",
      address: "Невский пр-кт, 114",
      landmark: "вход в ТК Невский Центр",
      latitude: 59.9312,
      longitude: 30.3601,
      geoAccuracyMeters: 5.0
    },
    construction: {
      code: "DS-SPB-0081",
      type: "Цифровой экран (DOOH)",
      side: "Экран №1 (к площади Восстания)",
      formatSize: "6.0 x 3.0 м",
      lightingType: "P3.9 Digital LED"
    },
    timestamp: "2026-09-09T06:10:45.000Z",
    displayDate: "09.09.2026",
    displayTime: "09:10:45",
    campaignName: "Ozon — Быстрая доставка за 15 минут",
    status: "defect_reported",
    defectDetails: "Левый нижний LED-кабинет 128x128 пикселей мерцает. Заявка отправлена техникам.",
    photos: [
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
    ],
    verificationStatus: "pending",
    notes: "Требуется замена шлейфа данных модуля В3",
    source: "telegram_web_app"
  }
];

class ReportRepository {
  constructor() {
    this._initStorage();
  }

  _initStorage() {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify(INITIAL_USERS, null, 2), 'utf-8');
    }
    if (!fs.existsSync(REPORTS_FILE)) {
      fs.writeFileSync(REPORTS_FILE, JSON.stringify(INITIAL_REPORTS, null, 2), 'utf-8');
    }
    if (!fs.existsSync(CONTRACTORS_FILE)) {
      fs.writeFileSync(CONTRACTORS_FILE, JSON.stringify(INITIAL_CONTRACTORS, null, 2), 'utf-8');
    }
    if (!fs.existsSync(CONSTRUCTIONS_FILE)) {
      fs.writeFileSync(CONSTRUCTIONS_FILE, JSON.stringify(INITIAL_CONSTRUCTIONS, null, 2), 'utf-8');
    }
  }

  getAllUsers() {
    try {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading users:', err);
      return INITIAL_USERS;
    }
  }

  getUserById(id) {
    const users = this.getAllUsers();
    return users.find(u => u.id === id || u.username === id) || null;
  }

  saveUsers(users) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error saving users:', err);
      return false;
    }
  }

  updateUser(id, updatedFields) {
    const users = this.getAllUsers();
    const index = users.findIndex(u => u.id === id || u.username === id);
    if (index === -1) return null;

    users[index] = {
      ...users[index],
      ...updatedFields,
      id: users[index].id // preserve primary key
    };

    this.saveUsers(users);

    // If contractorId is present, also synchronize contractor record
    if (users[index].contractorId) {
      this.updateContractor(users[index].contractorId, {
        name: users[index].organization,
        representative: users[index].name,
        phone: users[index].phone,
        telegramUser: users[index].telegramUser,
        inn: users[index].inn
      });
    }

    return users[index];
  }

  getAllReports() {
    try {
      const data = fs.readFileSync(REPORTS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading reports:', err);
      return INITIAL_REPORTS;
    }
  }

  getReportById(id) {
    const reports = this.getAllReports();
    return reports.find(r => r.id === id) || null;
  }

  updateReport(id, updatedFields) {
    const reports = this.getAllReports();
    const index = reports.findIndex(r => r.id === id);
    if (index === -1) return null;

    const existing = reports[index];

    // Deep merge while preserving the required strict 4-tier structure
    const updated = {
      ...existing,
      ...updatedFields,
      id: existing.id,
      // 1. Поставщик
      contractor: {
        ...existing.contractor,
        ...(updatedFields.contractor || {})
      },
      // 2. Локация
      location: {
        ...existing.location,
        ...(updatedFields.location || {})
      },
      // 3. Конструкция
      construction: {
        ...existing.construction,
        ...(updatedFields.construction || {})
      },
      // 4. Дата и время
      timestamp: updatedFields.timestamp || existing.timestamp,
      displayDate: updatedFields.displayDate || existing.displayDate,
      displayTime: updatedFields.displayTime || existing.displayTime
    };

    reports[index] = updated;
    this.saveReports(reports);
    return updated;
  }

  saveReports(reports) {
    try {
      fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error saving reports:', err);
      return false;
    }
  }

  addReport(report) {
    const reports = this.getAllReports();
    reports.unshift(report);
    this.saveReports(reports);
    return report;
  }

  createReport(report) {
    return this.addReport(report);
  }

  deleteReport(id) {
    const reports = this.getAllReports();
    const filtered = reports.filter(r => r.id !== id);
    if (filtered.length !== reports.length) {
      this.saveReports(filtered);
      return true;
    }
    return false;
  }

  getAllContractors() {
    try {
      const data = fs.readFileSync(CONTRACTORS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return INITIAL_CONTRACTORS;
    }
  }

  saveContractors(contractors) {
    try {
      fs.writeFileSync(CONTRACTORS_FILE, JSON.stringify(contractors, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error saving contractors:', err);
      return false;
    }
  }

  updateContractor(id, updatedFields) {
    const contractors = this.getAllContractors();
    const index = contractors.findIndex(c => c.id === id);
    if (index === -1) return null;

    contractors[index] = {
      ...contractors[index],
      ...updatedFields,
      id: contractors[index].id
    };

    this.saveContractors(contractors);
    return contractors[index];
  }

  getAllConstructions() {
    try {
      const data = fs.readFileSync(CONSTRUCTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return INITIAL_CONSTRUCTIONS;
    }
  }

  saveConstructions(constructions) {
    try {
      fs.writeFileSync(CONSTRUCTIONS_FILE, JSON.stringify(constructions, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error saving constructions:', err);
      return false;
    }
  }
}

export const reportRepository = new ReportRepository();
