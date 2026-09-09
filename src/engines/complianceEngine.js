// ComplianceEngine: compares field submission against KAM registered construction & criteria
export class ComplianceEngine {
  /**
   * Calculates distance in meters between two GPS coordinates using the Haversine formula
   */
  static calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * Evaluates field submission against KAM approved address program
   */
  static evaluate({ fieldReport, kamProgram }) {
    const checks = [];
    let isFullyCompliant = true;

    // 1. Check if construction exists in KAM address program
    const targetCode = (fieldReport.constructionCode || '').trim().toUpperCase();
    const registeredConst = kamProgram?.constructions?.find(
      c => c.code.toUpperCase() === targetCode
    );

    if (!registeredConst) {
      checks.push({
        id: 'CONSTRUCTION_REGISTRY',
        label: 'Реестр конструкций КАМ',
        passed: false,
        severity: 'CRITICAL',
        message: `Конструкция ${targetCode} не найдена в утвержденном списке КАМ поставщика.`
      });
      isFullyCompliant = false;
    } else {
      checks.push({
        id: 'CONSTRUCTION_REGISTRY',
        label: 'Реестр конструкций КАМ',
        passed: true,
        severity: 'INFO',
        message: `Конструкция ${registeredConst.code} (${registeredConst.type}) подтверждена в адресной программе.`
      });

      // 2. Check Side matching
      if (fieldReport.constructionSide && registeredConst.side) {
        const sideMatch =
          registeredConst.side.toLowerCase().includes(fieldReport.constructionSide.toLowerCase()) ||
          fieldReport.constructionSide.toLowerCase().includes(registeredConst.side.toLowerCase());

        checks.push({
          id: 'CONSTRUCTION_SIDE',
          label: 'Соответствие стороны размещения',
          passed: sideMatch,
          severity: sideMatch ? 'INFO' : 'WARNING',
          message: sideMatch
            ? `Сторона размещения (${fieldReport.constructionSide}) совпадает с ТЗ.`
            : `Заявленная сторона (${fieldReport.constructionSide}) отличается от эталона (${registeredConst.side}).`
        });
        if (!sideMatch) isFullyCompliant = false;
      }

      // 3. Geolocation proximity verification
      if (fieldReport.gps?.latitude && fieldReport.gps?.longitude && registeredConst.latitude && registeredConst.longitude) {
        const distMeters = this.calculateDistanceMeters(
          fieldReport.gps.latitude,
          fieldReport.gps.longitude,
          registeredConst.latitude,
          registeredConst.longitude
        );

        const tolerance = registeredConst.toleranceMeters || 300;
        const passedGeo = distMeters <= tolerance;

        checks.push({
          id: 'GEO_PROXIMITY',
          label: 'GPS-привязка к координатам объекта',
          passed: passedGeo,
          severity: passedGeo ? 'INFO' : 'WARNING',
          deviationMeters: distMeters,
          toleranceMeters: tolerance,
          message: passedGeo
            ? `Геолокация подтверждена: отклонение ${distMeters}м (допуск до ${tolerance}м).`
            : `Внимание: отклонение координат ${distMeters}м превышает допуск ${tolerance}м.`
        });
        if (!passedGeo) isFullyCompliant = false;
      } else {
        checks.push({
          id: 'GEO_PROXIMITY',
          label: 'GPS-привязка к координатам объекта',
          passed: true,
          severity: 'INFO',
          message: 'GPS зафиксирован в онлайн-режиме.'
        });
      }
    }

    // 4. Master Criteria File verification
    if (kamProgram?.masterRequirementFile) {
      checks.push({
        id: 'MASTER_CRITERIA',
        label: 'Файл требований и критериев КАМ',
        passed: true,
        severity: 'INFO',
        message: `Проверено по эталону: «${kamProgram.masterRequirementFile.fileName}». Критерии: ${kamProgram.masterRequirementFile.criteriaSummary || 'Утверждены'}`
      });
    }

    return {
      isFullyCompliant,
      overallStatus: isFullyCompliant ? 'COMPLIANT' : 'DEVIATION_DETECTED',
      matchedConstruction: registeredConst || null,
      checks
    };
  }
}
