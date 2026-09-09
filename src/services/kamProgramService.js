import { kamProgramRepository } from '../repositories/kamProgramRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { MediaAnalysisEngine } from '../engines/mediaAnalysisEngine.js';

class KamProgramService {
  constructor() {
    this.repository = kamProgramRepository;
  }

  getPrograms(contractorId = null) {
    if (contractorId) {
      return this.repository.getByContractorId(contractorId);
    }
    return this.repository.getAll();
  }

  /**
   * KAM single-shot initialization or update of construction program and master criteria file
   */
  registerOrUpdateProgram({
    contractorId,
    contractorName,
    inn,
    kamName,
    kamPhone,
    kamEmail,
    constructions,
    masterFile
  }) {
    if (!contractorId && !contractorName) {
      throw new Error('Укажите идентификатор или наименование поставщика');
    }

    const existing = contractorId
      ? this.repository.getByContractorId(contractorId)
      : this.repository.getByContractorName(contractorName);

    const targetContractorId = contractorId || existing?.contractorId || `cnt_${Date.now()}`;
    const targetContractorName = contractorName || existing?.contractorName || 'Поставщик OOH';

    // Format & validate constructions array
    const cleanConstructions = (constructions || existing?.constructions || []).map(c => ({
      code: (c.code || '').trim().toUpperCase(),
      type: c.type || 'Билборд 3х6 м',
      city: c.city || 'Москва',
      address: c.address || 'Адрес не указан',
      side: c.side || 'Сторона А',
      formatSize: c.formatSize || '3.0 x 6.0 м',
      lightingType: c.lightingType || 'LED прожекторы',
      latitude: c.latitude ? parseFloat(c.latitude) : 55.751244,
      longitude: c.longitude ? parseFloat(c.longitude) : 37.618423,
      activeCampaign: c.activeCampaign || 'Текущая кампания',
      toleranceMeters: c.toleranceMeters ? parseInt(c.toleranceMeters) : 300
    }));

    // Process master requirement file (ZIP, PDF, or Mockup)
    let processedMasterFile = existing?.masterRequirementFile || null;
    if (masterFile && (masterFile.fileName || masterFile.base64)) {
      const zipAnalysis = MediaAnalysisEngine.analyzeCriteriaZip({
        fileName: masterFile.fileName,
        fileSize: masterFile.fileSize || 1024 * 500,
        base64OrBuffer: masterFile.base64
      });

      processedMasterFile = {
        fileName: masterFile.fileName,
        fileType: masterFile.fileType || 'application/octet-stream',
        fileSize: masterFile.fileSize || 1024 * 500,
        uploadedAt: new Date().toISOString(),
        uploadedBy: kamName || 'КАМ Поставщика',
        criteriaSummary: masterFile.criteriaSummary || 'Единые требования ко всем конструкциям адресной программы утверждены.',
        status: 'verified',
        engineChecks: zipAnalysis
      };
    }

    const payload = {
      contractorId: targetContractorId,
      contractorName: targetContractorName,
      inn: inn || existing?.inn || '',
      kamName: kamName || existing?.kamName || 'КАМ Поставщика',
      kamPhone: kamPhone || existing?.kamPhone || '',
      kamEmail: kamEmail || existing?.kamEmail || '',
      constructions: cleanConstructions,
      masterRequirementFile: processedMasterFile
    };

    const saved = this.repository.saveOrUpdate(payload);

    // Also synchronize global constructions list so dropdowns and audits stay in sync
    this._syncGlobalConstructions(cleanConstructions);

    return {
      success: true,
      data: saved,
      summary: {
        totalConstructions: cleanConstructions.length,
        hasMasterFile: !!processedMasterFile,
        masterFileName: processedMasterFile?.fileName || null,
        status: 'ADDRESS_PROGRAM_ACTIVE'
      }
    };
  }

  _syncGlobalConstructions(newConstructions) {
    try {
      const allGlobal = reportRepository.getAllConstructions();
      newConstructions.forEach(nc => {
        const idx = allGlobal.findIndex(g => g.code.toUpperCase() === nc.code.toUpperCase());
        if (idx >= 0) {
          allGlobal[idx] = { ...allGlobal[idx], ...nc };
        } else {
          allGlobal.push(nc);
        }
      });
      reportRepository.saveConstructions(allGlobal);
    } catch (e) {
      console.warn('Sync global constructions notice:', e);
    }
  }
}

export const kamProgramService = new KamProgramService();
