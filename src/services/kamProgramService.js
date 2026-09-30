import { databaseRepository } from '../repositories/databaseRepository.js';
import { MediaAnalysisEngine } from '../engines/mediaAnalysisEngine.js';

class KamProgramService {
  getPrograms(contractorId = null) {
    const suppliers = databaseRepository.getSuppliers();
    const constructions = databaseRepository.getConstructions();

    return suppliers
      .filter(s => !contractorId || s.id === contractorId)
      .map(s => {
        const csts = constructions.filter(c => c.supplier_id === s.id);
        return {
          contractorId: s.id,
          contractorName: s.name,
          inn: s.inn,
          constructions: csts.map(c => ({
            code: c.code,
            type: c.type,
            side: c.side,
            address: c.address_location,
            latitude: c.latitude,
            longitude: c.longitude
          })),
          masterRequirementFile: {
            fileName: 'master_tz.pdf',
            criteriaSummary: 'Стандартные требования OOH SDIP к проверке'
          }
        };
      });
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
      ? databaseRepository.getSupplierById(contractorId)
      : databaseRepository.getSuppliers().find(s => s.name === contractorName);

    const targetContractorId = contractorId || existing?.id || `sup_${Date.now()}`;
    const targetContractorName = contractorName || existing?.name || 'Поставщик OOH';

    // Format & validate constructions array
    const cleanConstructions = (constructions || []).map(c => ({
      code: (c.code || '').trim().toUpperCase(),
      type: c.type || 'Билборд 3х6 м',
      city: c.city || 'Москва',
      address: c.address || c.address_location || 'Адрес не указан',
      side: c.side || 'Сторона А',
      formatSize: c.formatSize || '3.0 x 6.0 м',
      lightingType: c.lightingType || 'LED прожекторы',
      latitude: c.latitude ? parseFloat(c.latitude) : 55.751244,
      longitude: c.longitude ? parseFloat(c.longitude) : 37.618423,
      activeCampaign: c.activeCampaign || 'Текущая кампания',
      toleranceMeters: c.toleranceMeters ? parseInt(c.toleranceMeters) : 300
    }));

    // Process master requirement file (ZIP, PDF, or Mockup)
    let processedMasterFile = null;
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

    if (cleanConstructions.length > 0) {
      databaseRepository.saveConstructionsBatch({
        supplier_id: targetContractorId,
        month_period: '2026-09',
        constructions: cleanConstructions
      });
    }

    const payload = {
      contractorId: targetContractorId,
      contractorName: targetContractorName,
      inn: inn || existing?.inn || '',
      kamName: kamName || 'КАМ Поставщика',
      kamPhone: kamPhone || '',
      kamEmail: kamEmail || '',
      constructions: cleanConstructions,
      masterRequirementFile: processedMasterFile
    };

    return {
      success: true,
      data: payload,
      summary: {
        totalConstructions: cleanConstructions.length,
        hasMasterFile: !!processedMasterFile,
        masterFileName: processedMasterFile?.fileName || null,
        status: 'ADDRESS_PROGRAM_ACTIVE'
      }
    };
  }
}

export const kamProgramService = new KamProgramService();
