import assert from 'node:assert';
import { ComplianceEngine } from '../src/engines/complianceEngine.js';
import { MediaAnalysisEngine } from '../src/engines/mediaAnalysisEngine.js';
import { WatermarkStampEngine } from '../src/engines/watermarkStampEngine.js';
import { StorageFolderEngine } from '../src/engines/storageFolderEngine.js';
import { kamProgramService } from '../src/services/kamProgramService.js';
import { fieldReportService } from '../src/services/fieldReportService.js';
import { archiveService } from '../src/services/archiveService.js';

console.log('--- STARTING SDIP OOH SYSTEM TESTS ---');

// 1. ComplianceEngine Test
{
  const kamProgram = {
    contractorId: 'cnt_01',
    constructions: [
      { code: 'BB-MOW-0104', side: 'Сторона А', latitude: 55.7928, longitude: 37.5432 }
    ]
  };

  const result = ComplianceEngine.evaluate({
    fieldReport: {
      constructionCode: 'BB-MOW-0104',
      constructionSide: 'Сторона А',
      gps: { latitude: 55.7928, longitude: 37.5432 }
    },
    kamProgram
  });

  assert.strictEqual(result.isFullyCompliant, true, 'ComplianceEngine should pass exact match');
  assert.strictEqual(result.overallStatus, 'COMPLIANT');
  console.log('✓ ComplianceEngine passed');
}

// 2. MediaAnalysisEngine Real-Time Verification
{
  // Recent timestamp should pass
  const recentTime = new Date().toISOString();
  const validCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
    captureTimestamp: recentTime,
    captureSource: 'live_camera_stream'
  });
  assert.strictEqual(validCheck.isRealTime, true, 'Recent live camera should pass');

  // Stale timestamp (> 180 sec old) representing gallery photo should be rejected
  const oldTime = new Date(Date.now() - 300000).toISOString();
  const invalidCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
    captureTimestamp: oldTime,
    captureSource: 'gallery_picker'
  });
  assert.strictEqual(invalidCheck.isRealTime, false, 'Stale gallery photo must be rejected');

  // Senior Computer Vision Inspector Check (missing photo -> REJECTED with detected_issues)
  const emptyInspection = MediaAnalysisEngine.inspectFieldReport({ mediaBase64: '' });
  assert.strictEqual(emptyInspection.status, 'REJECTED');
  assert.ok(emptyInspection.detected_issues.length > 0);

  // Valid photo payload -> APPROVED
  const dummyData = 'data:image/jpeg;base64,' + 'A'.repeat(25000);
  const validInspection = MediaAnalysisEngine.inspectFieldReport({ mediaBase64: dummyData });
  assert.strictEqual(validInspection.status, 'APPROVED');
  assert.strictEqual(validInspection.detected_issues.length, 0);

  console.log('✓ MediaAnalysisEngine real-time rejection & CV inspection passed');
}

// 3. WatermarkStampEngine Test
{
  const stamp = WatermarkStampEngine.generateOfficialStamp({
    contractor: { name: 'ООО «МедиаАутдор Групп»' },
    location: { address: 'г. Москва, Ленинградский пр-кт, 37 к2', latitude: 55.7928, longitude: 37.5432 },
    construction: { code: 'BB-MOW-0104', side: 'Сторона А' },
    specialist: { name: 'Абдулазиз Каримов' }
  });

  assert.ok(stamp.stampHash.startsWith('OOH-'), 'Stamp hash must have OOH prefix');
  assert.strictEqual(stamp.pillar1_Contractor.organization, 'ООО «МедиаАутдор Групп»');
  assert.strictEqual(stamp.pillar3_Construction.code, 'BB-MOW-0104');
  console.log('✓ WatermarkStampEngine 4-pillar digital stamp passed');
}

// 4. StorageFolderEngine Test
{
  const pathInfo = StorageFolderEngine.resolveStorageDestination({
    contractorName: 'ООО «МедиаАутдор Групп»',
    reportDate: new Date('2026-09-09T10:30:00.000Z'),
    constructionCode: 'BB-MOW-0104',
    constructionSide: 'Сторона А'
  });

  assert.strictEqual(pathInfo.safeContractorName, 'ООО_МедиаАутдор_Групп');
  assert.strictEqual(pathInfo.monthString, '2026-09');
  assert.strictEqual(pathInfo.relativeFolder, 'ООО_МедиаАутдор_Групп/2026-09');
  console.log('✓ StorageFolderEngine monthly folder structure passed');
}

// 5. KAM Program Service Test
{
  const result = kamProgramService.registerOrUpdateProgram({
    contractorId: 'cnt_01',
    contractorName: 'ООО «МедиаАутдор Групп»',
    kamName: 'Елена Соколова',
    constructions: [
      { code: 'BB-MOW-0104', side: 'Сторона А', address: 'Ленинградский пр-кт, 37' }
    ],
    masterFile: {
      fileName: 'specs_september.zip',
      fileSize: 10240,
      criteriaSummary: 'Фронтальный план, 100% читаемость'
    }
  });

  assert.strictEqual(result.success, true, 'Program registration must succeed');
  assert.strictEqual(result.data.contractorId, 'cnt_01');
  assert.strictEqual(result.data.masterRequirementFile.engineChecks.valid, true);
  assert.strictEqual(result.data.masterRequirementFile.engineChecks.archiveIntegrity, 'VERIFIED_CRC32_OK');
  console.log('✓ KamProgramService master file & criteria check passed');
}

// 6. FieldReportService End-to-End Test
{
  const result = await fieldReportService.processRealTimeSubmission({
    contractorId: 'cnt_01',
    contractorName: 'ООО «МедиаАутдор Групп»',
    specialistName: 'Абдулазиз Каримов',
    constructionCode: 'BB-MOW-0104',
    constructionSide: 'Сторона А',
    location: {
      city: 'Москва',
      address: 'Ленинградский пр-кт, 37 к2',
      latitude: 55.7928,
      longitude: 37.5432
    },
    mediaBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
    mediaType: 'image/jpeg',
    captureTimestamp: new Date().toISOString(),
    captureSource: 'live_camera_stream'
  });

  assert.strictEqual(result.success, true, 'Report processing must succeed');
  assert.ok(result.storage.folder.includes('2026-09'), 'Folder must include month 2026-09');
  assert.ok(result.storage.folder.includes('ООО_МедиаАутдор_Групп'), 'Folder must include contractor name');
  console.log('✓ FieldReportService real-time processing and storage passed');
}

// 7. ArchiveService Test
{
  const tree = archiveService.getArchiveStructure();
  assert.ok(Array.isArray(tree), 'Archive tree must be an array');
  const mediaOutdoor = tree.find(t => t.contractorFolder.includes('МедиаАутдор'));
  assert.ok(mediaOutdoor, 'Must contain МедиаАутдор folder');
  assert.ok(mediaOutdoor.months.length > 0, 'Must have at least one monthly subfolder');
  console.log('✓ ArchiveService directory scanning passed');
}

console.log('--- ALL SYSTEM TESTS PASSED SUCCESSFULLY (7/7) ---');
