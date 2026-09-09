import { reportRepository } from '../repositories/reportRepository.js';
import { kamProgramRepository } from '../repositories/kamProgramRepository.js';
import { ComplianceEngine } from '../engines/complianceEngine.js';
import { MediaAnalysisEngine } from '../engines/mediaAnalysisEngine.js';
import { WatermarkStampEngine } from '../engines/watermarkStampEngine.js';
import { StorageFolderEngine } from '../engines/storageFolderEngine.js';

class FieldReportService {
  /**
   * Processes a real-time submission from a field specialist
   */
  async processRealTimeSubmission({
    contractorId,
    contractorName,
    specialistName,
    specialistPhone,
    constructionCode,
    constructionSide,
    location, // { city, address, latitude, longitude, accuracy }
    mediaBase64,
    mediaType = 'image/jpeg',
    captureTimestamp,
    captureSource, // 'live_camera_stream' | 'camera_sensor'
    campaignName,
    notes,
    defectDetected,
    defectDetails
  }) {
    // 1. STRICT REAL-TIME VALIDATION: Gallery bypass prevention
    const realTimeCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
      captureTimestamp,
      captureSource: captureSource || 'live_camera_stream'
    });

    if (!realTimeCheck.isRealTime) {
      return {
        success: false,
        error: realTimeCheck.error || 'Загрузка из галереи отклонена. Отчет принимается строго в реальном времени с камеры.',
        engineStatus: 'REJECTED_GALLERY_DETECTED',
        realTimeCheck
      };
    }

    // 2. Fetch KAM address program for this contractor
    const kamProgram = contractorId
      ? kamProgramRepository.getByContractorId(contractorId)
      : kamProgramRepository.getByContractorName(contractorName);

    // 3. COMPLIANCE ENGINE: cross-reference with KAM program
    const complianceResult = ComplianceEngine.evaluate({
      fieldReport: {
        constructionCode,
        constructionSide,
        gps: location
      },
      kamProgram
    });

    // 4. MEDIA ANALYSIS ENGINE: check resolution, brightness, sharpness
    const mediaAnalysis = MediaAnalysisEngine.analyzeMedia({
      mediaBase64,
      mediaType
    });

    // 5. Build full metadata and matched construction details
    const matched = complianceResult.matchedConstruction;
    const finalConstruction = {
      code: constructionCode?.toUpperCase(),
      type: matched?.type || 'Билборд 3х6 м',
      side: constructionSide || matched?.side || 'Сторона А',
      lightingType: matched?.lightingType || 'LED подсветка'
    };

    const finalLocation = {
      city: location?.city || matched?.city || 'Москва',
      address: location?.address || matched?.address || 'Адрес не указан',
      latitude: location?.latitude || matched?.latitude || 55.751244,
      longitude: location?.longitude || matched?.longitude || 37.618423,
      accuracy: location?.accuracy || 5
    };

    const contractorObj = {
      id: contractorId || kamProgram?.contractorId || 'cnt_gen',
      name: contractorName || kamProgram?.contractorName || 'Поставщик OOH',
      representative: specialistName || 'Полевой специалист',
      phone: specialistPhone || ''
    };

    // 6. WATERMARK & STAMP ENGINE: generate official 4-pillar digital stamp
    const stamp = WatermarkStampEngine.generateOfficialStamp({
      contractor: contractorObj,
      location: finalLocation,
      construction: finalConstruction,
      captureTime: captureTimestamp,
      specialist: { name: specialistName }
    });

    // 7. STORAGE FOLDER ENGINE: save into supplier folder for target month
    // "после сохраняет в папке именуемым наименованием поставщиком под тот месяц за который отчет направляется"
    const storageResult = StorageFolderEngine.persistFieldArtifact({
      contractorName: contractorObj.name,
      constructionCode: finalConstruction.code,
      constructionSide: finalConstruction.side,
      reportDate: captureTimestamp,
      mediaBase64,
      metadata: {
        stamp,
        compliance: complianceResult,
        mediaQuality: mediaAnalysis,
        realTime: realTimeCheck
      }
    });

    // 8. Register into main reports registry for central monitoring
    const now = new Date(captureTimestamp || Date.now());
    const displayDate = now.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const displayTime = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const reportRecord = {
      contractor: contractorObj,
      location: finalLocation,
      construction: finalConstruction,
      displayDate,
      displayTime,
      campaignName: campaignName || matched?.activeCampaign || 'Рекламная кампания OOH 2026',
      status: defectDetected ? 'defect_reported' : 'mounted',
      defectDetails: defectDetails || (complianceResult.isFullyCompliant ? null : 'Выявлены отклонения от ТЗ'),
      notes: notes || '',
      verificationStatus: complianceResult.isFullyCompliant ? 'verified' : 'pending',
      verifiedBy: complianceResult.isFullyCompliant ? 'Автоматический движок OOH SDIP' : null,
      verificationDate: complianceResult.isFullyCompliant ? new Date().toISOString() : null,
      photoUrl: storageResult.relativeWebPath || null,
      monthlyStorageFolder: storageResult.relativeFolder,
      storedFileName: storageResult.fileName,
      stampHash: stamp.stampHash,
      realTimeCapture: true,
      captureSource: captureSource || 'live_camera_stream',
      engineEvaluation: {
        complianceStatus: complianceResult.overallStatus,
        isFullyCompliant: complianceResult.isFullyCompliant,
        checks: complianceResult.checks,
        mediaQuality: mediaAnalysis,
        realTimeStatus: 'VERIFIED_REALTIME'
      }
    };

    const savedReport = reportRepository.createReport(reportRecord);

    return {
      success: true,
      report: savedReport,
      storage: {
        folder: storageResult.relativeFolder,
        fileName: storageResult.fileName,
        webPath: storageResult.relativeWebPath
      },
      stamp,
      compliance: complianceResult,
      mediaAnalysis
    };
  }
}

export const fieldReportService = new FieldReportService();
