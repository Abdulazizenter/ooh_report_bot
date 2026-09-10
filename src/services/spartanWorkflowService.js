import { databaseRepository } from '../repositories/databaseRepository.js';
import { MediaAnalysisEngine } from '../engines/mediaAnalysisEngine.js';
import { ComplianceEngine } from '../engines/complianceEngine.js';
import { WatermarkStampEngine } from '../engines/watermarkStampEngine.js';
import { StorageFolderEngine } from '../engines/storageFolderEngine.js';

export class SpartanWorkflowService {
  /**
   * Specialist: Get nearby constructions sorted by distance
   */
  getNearbyTasks({ latitude, longitude, specialistTelegramId }) {
    const user = specialistTelegramId
      ? databaseRepository.getUserByTelegramId(specialistTelegramId)
      : null;

    const supplierId = user?.role === 'Specialist' ? user.supplier_id : null;

    return databaseRepository.getNearbyConstructions({
      latitude: Number(latitude) || 55.751244,
      longitude: Number(longitude) || 37.618423,
      supplier_id: supplierId
    });
  }

  /**
   * Specialist: Process Real-Time Photo Report Submission
   */
  async submitSpecialistReport({
    telegramId,
    constructionId,
    mediaBase64,
    mediaType = 'image/jpeg',
    latitude,
    longitude,
    captureTimestamp,
    captureSource = 'camera_sensor'
  }) {
    // 1. Verify User
    const user = databaseRepository.getUserByTelegramId(telegramId) || {
      id: 'usr_spec_anon',
      full_name: 'Полевой специалист',
      role: 'Specialist',
      supplier_id: 'sup_01'
    };

    // 2. Fetch Construction
    const construction = databaseRepository.getConstructionById(constructionId);
    if (!construction) {
      return {
        status: 'REJECTED',
        confidence_score: 1.0,
        detected_issues: ['Конструкция не найдена в базе ТЗ КАМа.'],
        reasoning: 'Выбранный объект отсутствует в адресной программе. Пожалуйста, обновите гео-список.'
      };
    }

    const supplier = databaseRepository.getSupplierById(construction.supplier_id) || {
      name: 'ООО «МедиаАутдор Групп»',
      folder_path: 'ООО_МедиаАутдор_Групп'
    };

    // 3. Real-Time Check: Stale gallery uploads rejected (<180s requirement)
    const realTimeCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
      captureTimestamp: captureTimestamp || new Date().toISOString(),
      captureSource: captureSource || 'camera_sensor'
    });

    if (!realTimeCheck.isRealTime) {
      return {
        status: 'REJECTED',
        confidence_score: 1.0,
        detected_issues: [realTimeCheck.error || 'Загрузка старого фото из галереи заблокирована.'],
        reasoning: 'Обнаружена попытка загрузки из галереи. Разрешена только онлайн-съемка через камеру в момент нахождения у объекта.'
      };
    }

    // 4. GPS Geolocation distance check
    const currentLat = Number(latitude);
    const currentLon = Number(longitude);
    const distMeters = ComplianceEngine.calculateDistanceMeters(
      currentLat,
      currentLon,
      construction.latitude,
      construction.longitude
    );

    const tolerance = construction.tolerance_meters || 300;
    const isGeoValid = distMeters !== null && distMeters <= tolerance;

    // 5. Senior Computer Vision Inspector: inspect photo vs KAM's AI Criteria
    const cvInspection = MediaAnalysisEngine.inspectFieldReport({
      mediaBase64,
      kamCriteria: [construction.ai_criteria],
      constructionCode: construction.code
    });

    // 6. Branching Logic
    const hasDefect = !isGeoValid || cvInspection.status === 'REJECTED';

    if (hasDefect) {
      const issues = [...cvInspection.detected_issues];
      if (!isGeoValid) {
        issues.push(`Отклонение GPS координат: ${distMeters}м от объекта (допустимо до ${tolerance}м).`);
      }

      const reasoning = cvInspection.status === 'REJECTED'
        ? cvInspection.reasoning
        : `Вы находитесь слишком далеко от объекта (${distMeters}м). Подойдите ближе к конструкции и переделайте снимок.`;

      // Save rejected report in DB for audit trail, but DO NOT save into clean monthly archive folder
      databaseRepository.saveReport({
        construction_id: construction.id,
        specialist_id: user.id,
        supplier_id: construction.supplier_id,
        photo_url: '', // Unsaved in clean storage
        raw_photo_url: null,
        gps_lat: currentLat,
        gps_lon: currentLon,
        geo_distance_meters: distMeters,
        status: 'REJECTED',
        confidence_score: cvInspection.confidence_score,
        ai_reasoning: reasoning,
        detected_issues: issues,
        stamp_hash: 'REJECTED_NO_STAMP',
        capture_source: captureSource,
        captured_at: captureTimestamp || new Date().toISOString()
      });

      return {
        status: 'REJECTED',
        confidence_score: cvInspection.confidence_score,
        detected_issues: issues,
        reasoning,
        geo_distance_meters: distMeters,
        construction_code: construction.code
      };
    }

    // 7. Status = APPROVED: Generate 4-pillar digital stamp and save cleanly
    const stamp = WatermarkStampEngine.generateOfficialStamp({
      contractor: {
        id: supplier.id,
        name: supplier.name
      },
      location: {
        address: construction.address_location,
        latitude: currentLat,
        longitude: currentLon
      },
      construction: {
        code: construction.code,
        side: construction.side,
        type: construction.type
      },
      captureTime: captureTimestamp,
      specialist: {
        name: user.full_name
      }
    });

    const storageArtifact = StorageFolderEngine.persistFieldArtifact({
      contractorName: supplier.folder_path || supplier.name,
      constructionCode: construction.code,
      constructionSide: construction.side,
      reportDate: captureTimestamp || new Date(),
      mediaBase64,
      metadata: {
        stamp,
        constructionId: construction.id,
        specialist: user.full_name,
        aiScore: cvInspection.confidence_score
      }
    });

    // 8. Write to Relational Reports table
    const savedReport = databaseRepository.saveReport({
      construction_id: construction.id,
      specialist_id: user.id,
      supplier_id: construction.supplier_id,
      photo_url: storageArtifact.relativeWebPath,
      raw_photo_url: null,
      gps_lat: currentLat,
      gps_lon: currentLon,
      geo_distance_meters: distMeters,
      status: 'APPROVED',
      confidence_score: cvInspection.confidence_score,
      ai_reasoning: cvInspection.reasoning,
      detected_issues: [],
      stamp_hash: stamp.stampHash,
      capture_source: captureSource,
      captured_at: captureTimestamp || new Date().toISOString()
    });

    return {
      status: 'APPROVED',
      confidence_score: cvInspection.confidence_score,
      detected_issues: [],
      reasoning: cvInspection.reasoning,
      photo_url: storageArtifact.relativeWebPath,
      storage_folder: storageArtifact.relativeFolder,
      stamp_hash: stamp.stampHash,
      report_id: savedReport.id,
      construction_code: construction.code,
      geo_distance_meters: distMeters
    };
  }

  /**
   * KAM: Get Progress Dashboard by Month
   */
  getKamDashboard(monthPeriod = '2026-09') {
    return databaseRepository.getKamDashboard(monthPeriod);
  }

  /**
   * KAM: Upload TZ / Criteria Package (ZIP, Excel or JSON array)
   */
  uploadKamTzPackage({ supplierId, monthPeriod = '2026-09', fileName, constructions, defaultCriteria }) {
    const supplier = databaseRepository.getSupplierById(supplierId);
    if (!supplier) {
      return { success: false, error: 'Поставщик не найден.' };
    }

    const result = databaseRepository.saveConstructionsBatch({
      supplier_id: supplierId,
      month_period: monthPeriod,
      constructions: constructions || [],
      defaultCriteria: defaultCriteria || '100% читаемость, отсутствие перекрытий кронами деревьев, чистый баннер.'
    });

    return {
      success: true,
      supplier_name: supplier.name,
      month_period: monthPeriod,
      fileName,
      ...result
    };
  }
}

export const spartanWorkflowService = new SpartanWorkflowService();
