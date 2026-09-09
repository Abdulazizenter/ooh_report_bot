import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const KAM_PROGRAMS_FILE = path.join(DATA_DIR, 'kam_programs.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed programs for contractors pre-filled by KAM
const INITIAL_KAM_PROGRAMS = [
  {
    contractorId: "cnt_01",
    contractorName: "ООО «МедиаАутдор Групп»",
    inn: "7701928341",
    kamName: "Елена Соколова (КАМ)",
    kamPhone: "+7 (495) 789-01-23",
    kamEmail: "e.sokolova@mediaoutdoor.ru",
    lastUpdated: "2026-09-08T14:30:00.000Z",
    masterRequirementFile: {
      fileName: "Trebovaniya_i_Kriterii_Sentyabr_2026.zip",
      fileType: "application/zip",
      fileSize: 4892010,
      uploadedAt: "2026-09-08T14:30:00.000Z",
      uploadedBy: "Елена Соколова (КАМ)",
      criteriaSummary: "Фронтальный ракурс 15-20 м, горизонтальная ориентация, читаемость логотипа и QR-кода, обязательная вечерняя проверка LED-подсветки",
      status: "verified",
      engineChecks: {
        zipIntegrity: true,
        mockupIncluded: true,
        criteriaCount: 4,
        status: "APPROVED_BY_ENGINE"
      }
    },
    constructions: [
      {
        code: "BB-MOW-0104",
        type: "Билборд 3х6 м",
        city: "Москва",
        address: "Ленинградский пр-кт, 37 к2",
        side: "Сторона А (в центр)",
        formatSize: "3.0 x 6.0 м",
        lightingType: "LED прожекторы",
        latitude: 55.7928,
        longitude: 37.5432,
        activeCampaign: "СБЕР — Премиальный сервис 2026",
        toleranceMeters: 250
      },
      {
        code: "SS-MOW-0042",
        type: "Суперсайт 15х5 м",
        city: "Москва",
        address: "МКАД 68-й км, внешняя сторона",
        side: "Сторона А (по ходу)",
        formatSize: "15.0 x 5.0 м",
        lightingType: "Внешняя заливающая",
        latitude: 55.8451,
        longitude: 37.3820,
        activeCampaign: "Яндекс Маркет — Осенний фестиваль",
        toleranceMeters: 350
      },
      {
        code: "CB-MOW-0219",
        type: "Сити-борд 3.7х2.7 м",
        city: "Москва",
        address: "Кутузовский пр-кт, 22",
        side: "Сторона Б (из центра)",
        formatSize: "3.7 x 2.7 м",
        lightingType: "Внутренняя динамическая",
        latitude: 55.7449,
        longitude: 37.5458,
        activeCampaign: "Т-Банк — Бизнес под ключ",
        toleranceMeters: 200
      }
    ]
  },
  {
    contractorId: "cnt_02",
    contractorName: "ООО «Русс Аутдор Монтаж»",
    inn: "7722334455",
    kamName: "Сергей Волков (КАМ)",
    kamPhone: "+7 (495) 660-11-22",
    kamEmail: "s.volkov@russoutdoor.ru",
    lastUpdated: "2026-09-08T16:00:00.000Z",
    masterRequirementFile: {
      fileName: "TehZadanie_Makety_RussOutdoor_09_2026.pdf",
      fileType: "application/pdf",
      fileSize: 2450100,
      uploadedAt: "2026-09-08T16:00:00.000Z",
      uploadedBy: "Сергей Волков (КАМ)",
      criteriaSummary: "Запрет складок баннера, съемка строго с осевой линии дороги, фиксация номерной плашки",
      status: "verified",
      engineChecks: {
        pdfIntegrity: true,
        mockupIncluded: true,
        criteriaCount: 3,
        status: "APPROVED_BY_ENGINE"
      }
    },
    constructions: [
      {
        code: "BB-MOW-0588",
        type: "Билборд 3х6 м",
        city: "Москва",
        address: "Варшавское шоссе, 125",
        side: "Сторона А (в центр)",
        formatSize: "3.0 x 6.0 м",
        lightingType: "LED прожекторы",
        latitude: 55.6291,
        longitude: 37.6184,
        activeCampaign: "ВТБ — Ипотека 2026",
        toleranceMeters: 250
      },
      {
        code: "SS-MOW-0112",
        type: "Суперсайт 15х5 м",
        city: "Москва",
        address: "МКАД 32-й км, внутренняя сторона",
        side: "Сторона Б (против хода)",
        formatSize: "15.0 x 5.0 м",
        lightingType: "LED подсветка",
        latitude: 55.5782,
        longitude: 37.6012,
        activeCampaign: "Авито Недвижимость",
        toleranceMeters: 350
      }
    ]
  }
];

class KamProgramRepository {
  constructor() {
    this._ensureFile();
  }

  _ensureFile() {
    if (!fs.existsSync(KAM_PROGRAMS_FILE)) {
      fs.writeFileSync(KAM_PROGRAMS_FILE, JSON.stringify(INITIAL_KAM_PROGRAMS, null, 2), 'utf8');
    }
  }

  getAll() {
    try {
      this._ensureFile();
      const raw = fs.readFileSync(KAM_PROGRAMS_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed reading kam programs:', e);
      return INITIAL_KAM_PROGRAMS;
    }
  }

  getByContractorId(contractorId) {
    const all = this.getAll();
    return all.find(p => p.contractorId === contractorId) || null;
  }

  getByContractorName(contractorName) {
    const all = this.getAll();
    const cleanTarget = contractorName.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
    return all.find(p => {
      const cleanP = p.contractorName.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
      return cleanP.includes(cleanTarget) || cleanTarget.includes(cleanP);
    }) || null;
  }

  saveOrUpdate(programData) {
    const all = this.getAll();
    const idx = all.findIndex(p => p.contractorId === programData.contractorId);

    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        ...programData,
        lastUpdated: new Date().toISOString()
      };
    } else {
      all.push({
        ...programData,
        lastUpdated: new Date().toISOString()
      });
    }

    fs.writeFileSync(KAM_PROGRAMS_FILE, JSON.stringify(all, null, 2), 'utf8');
    return idx >= 0 ? all[idx] : all[all.length - 1];
  }
}

export const kamProgramRepository = new KamProgramRepository();
