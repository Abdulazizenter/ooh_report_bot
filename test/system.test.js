import assert from 'node:assert';
import { ComplianceEngine } from '../src/engines/complianceEngine.js';
import { MediaAnalysisEngine } from '../src/engines/mediaAnalysisEngine.js';
import { WatermarkStampEngine } from '../src/engines/watermarkStampEngine.js';
import { StorageFolderEngine } from '../src/engines/storageFolderEngine.js';
import { kamProgramService } from '../src/services/kamProgramService.js';
import { fieldReportService } from '../src/services/fieldReportService.js';
import { archiveService } from '../src/services/archiveService.js';
import { databaseRepository } from '../src/repositories/databaseRepository.js';
import { spartanWorkflowService } from '../src/services/spartanWorkflowService.js';

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
  const zeroCoordinate = ComplianceEngine.calculateDistanceMeters(0, 0, 0, 0);
  assert.strictEqual(zeroCoordinate, 0, 'Zero coordinates are valid GPS coordinates');
  const missingGps = ComplianceEngine.evaluate({ fieldReport: { constructionCode: 'BB-MOW-0104' }, kamProgram });
  assert.strictEqual(missingGps.isFullyCompliant, false, 'Missing GPS must not pass compliance');
  console.log('✓ ComplianceEngine passed');
}

// 2. MediaAnalysisEngine Real-Time Verification
{
  // Disable real Gemini API for tests to prevent invalid image errors on dummy data
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  // Recent timestamp should pass
  const recentTime = new Date().toISOString();
  const validCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
    captureTimestamp: recentTime,
    captureSource: 'live_camera_stream'
  });
  assert.strictEqual(validCheck.isRealTime, true, 'Recent live camera should pass');
  const unknownSourceCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({ captureTimestamp: recentTime, captureSource: 'unknown' });
  assert.strictEqual(unknownSourceCheck.isRealTime, false, 'Unknown capture source must be rejected');

  // Stale timestamp (> 180 sec old) representing gallery photo should be rejected
  const oldTime = new Date(Date.now() - 300000).toISOString();
  const invalidCheck = MediaAnalysisEngine.verifyRealTimeIntegrity({
    captureTimestamp: oldTime,
    captureSource: 'gallery_picker'
  });
  assert.strictEqual(invalidCheck.isRealTime, false, 'Stale gallery photo must be rejected');

  // Senior Computer Vision Inspector Check (missing photo -> REJECTED with detected_issues)
  const emptyInspection = await MediaAnalysisEngine.inspectFieldReport({ mediaBase64: '' });
  assert.strictEqual(emptyInspection.status, 'REJECTED');
  assert.ok(emptyInspection.detected_issues.length > 0);

  // Valid photo payload -> APPROVED
  const dummyData = 'data:image/jpeg;base64,' + 'A'.repeat(25000);
  const validInspection = await MediaAnalysisEngine.inspectFieldReport({ mediaBase64: dummyData });
  assert.strictEqual(validInspection.status, 'APPROVED');
  assert.strictEqual(validInspection.detected_issues.length, 0);

  if (originalKey) {
    process.env.GEMINI_API_KEY = originalKey;
  }

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

// 8. Relational Database Repository Test (4 Core Tables: Suppliers, Users, Constructions, Reports)
{
  const suppliers = databaseRepository.getSuppliers();
  assert.ok(suppliers.length >= 2, 'Suppliers table must have entries');

  const users = databaseRepository.getUsers();
  assert.ok(Array.isArray(users), 'Users table must exist');

  const constructions = databaseRepository.getConstructions();
  assert.ok(constructions.length >= 3, 'Constructions table must have entries');

  const nearby = databaseRepository.getNearbyConstructions({
    latitude: 55.7928,
    longitude: 37.5432
  });
  assert.ok(nearby.length > 0, 'Nearby constructions must be returned');
  assert.strictEqual(nearby[0].code, 'BB-MOW-0104', 'Exact coord match must be first item (0m distance)');
  assert.strictEqual(nearby[0].distance_meters, 0);

  const kamDash = databaseRepository.getKamDashboard('2026-09');
  assert.ok(Array.isArray(kamDash), 'KAM dashboard must return array of supplier progress');
  assert.ok(kamDash[0].progress_text.includes('Сдано'), 'Dashboard must format progress text');
  console.log('✓ DatabaseRepository 4-table relational model & geo-proximity passed');
}

// 9. Spartan Workflow Service End-to-End Test (Pipeline branching)
{
  databaseRepository.saveUser({ id: 'usr_spec_01', telegram_id: 20001, full_name: 'Тестовый специалист', role: 'Specialist', supplier_id: 'sup_01', is_active: true });
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  // Test 9a: Rejected when GPS is too far (> 50 km away)
  const farResult = await spartanWorkflowService.submitSpecialistReport({
    telegramId: 20001,
    constructionId: 'cst_01',
    mediaBase64: 'data:image/jpeg;base64,' + 'A'.repeat(25000),
    latitude: 59.9343, // Saint Petersburg (far away from Moscow)
    longitude: 30.3351,
    captureTimestamp: new Date().toISOString(),
    captureSource: 'camera_sensor'
  });
  assert.strictEqual(farResult.status, 'REJECTED', 'Far GPS report must be rejected');
  assert.ok(farResult.detected_issues.length > 0, 'Must provide issue description');
  console.log('✓ SpartanWorkflowService GPS deviation rejection passed');

  // Test 9b: Approved when at location (< tolerance) with valid camera capture
  const okResult = await spartanWorkflowService.submitSpecialistReport({
    telegramId: 20001,
    constructionId: 'cst_01',
    mediaBase64: 'data:image/jpeg;base64,' + 'A'.repeat(25000),
    latitude: 55.7928,
    longitude: 37.5432,
    captureTimestamp: new Date().toISOString(),
    captureSource: 'camera_sensor'
  });
  assert.strictEqual(okResult.status, 'APPROVED', 'Nearby valid report must be approved');
  assert.ok(okResult.photo_url.includes('ООО_МедиаАутдор_Групп'), 'Must save cleanly in supplier folder');
  assert.ok(okResult.stamp_hash.startsWith('OOH-'), 'Must have digital stamp hash');
  console.log('✓ SpartanWorkflowService end-to-end approved pipeline passed');

  if (originalKey) {
    process.env.GEMINI_API_KEY = originalKey;
  }
}

// 10. Production API security invariants
{
  const serverSource = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../server.js', import.meta.url), 'utf8'));
  assert.match(serverSource, /app\.use\('\/api', apiAuth\)/, 'All production API routes must use authentication middleware');
  assert.match(serverSource, /BETTER_AUTH_SECRET must be configured in production/, 'Production must fail closed without a session secret');
  assert.doesNotMatch(serverSource, /express\.static\(path\.join\(__dirname, 'storage'\)\)/, 'Storage must not be publicly mounted');
  console.log('✓ Production API authentication and private storage invariants passed');
}

// 11. Postgres repository contract
{
  const repositorySource = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/repositories/databaseRepository.js', import.meta.url), 'utf8'));
  assert.match(repositorySource, /new Pool\(/, 'Repository must use the Neon PostgreSQL pool');
  assert.match(repositorySource, /ON CONFLICT/, 'Seed writes must be idempotent');
  assert.doesNotMatch(repositorySource, /fs\.writeFileSync\(/, 'Production repository must not persist mutable state to local files');
  console.log('✓ Postgres repository contract passed');
}

// 12. Multi-role authentication & user supplier assignment
{
  const testUser = {
    id: 'usr_test_specialist_99',
    telegram_id: 99123456,
    full_name: 'Тестовый Специалист',
    role: 'specialist',
    supplier_id: 'sup_01',
    is_active: true
  };
  databaseRepository.saveUser(testUser);

  const found = databaseRepository.getUserByTelegramId('99123456');
  assert.ok(found, 'Specialist must be found by telegram_id');
  assert.strictEqual(found.role, 'specialist');
  assert.strictEqual(found.supplier_id, 'sup_01');

  // Verify proximity filter only retrieves assigned supplier constructions
  const nearby = databaseRepository.getNearbyConstructions({
    latitude: 55.7928,
    longitude: 37.5432,
    supplier_id: found.supplier_id,
    month_period: '2026-09'
  });
  assert.ok(nearby.length > 0, 'Must find constructions for supplier sup_01');
  assert.ok(nearby.every(c => c.supplier_id === 'sup_01'), 'Must strictly belong to sup_01');
  console.log('✓ Multi-role supplier assignment and geo-scoping passed');
}

// 14. Telegram Web App Cryptographic HMAC Verification Test
{
  const { validateTelegramInitData } = await import('../src/utils/telegramAuth.js');
  const crypto = await import('node:crypto');

  const botToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
  const userObj = { id: 85993905, first_name: 'Abdulaziz', username: 'abdulazizenter' };
  const userJson = JSON.stringify(userObj);
  const authDate = Math.floor(Date.now() / 1000);

  // Construct valid data_check_string
  const params = {
    auth_date: String(authDate),
    query_id: 'AAGh123',
    user: userJson
  };
  const checkString = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const validHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  const validInitData = `auth_date=${authDate}&query_id=AAGh123&user=${encodeURIComponent(userJson)}&hash=${validHash}`;
  const verifiedUser = validateTelegramInitData(validInitData, botToken);
  assert.ok(verifiedUser, 'Valid Telegram initData must be verified successfully');
  assert.strictEqual(verifiedUser.id, 85993905);

  // Invalid hash tamper check
  const tamperedInitData = `auth_date=${authDate}&query_id=AAGh123&user=${encodeURIComponent(userJson)}&hash=invalid_fake_hash`;
  const rejectedUser = validateTelegramInitData(tamperedInitData, botToken);
  assert.strictEqual(rejectedUser, null, 'Tampered Telegram initData must be rejected');
  console.log('✓ Telegram Web App HMAC-SHA256 verification passed');
}

// 15. Proof of Performance (PoP) Act Generation Test
{
  const { PdfReportService } = await import('../src/services/pdfReportService.js');

  const sampleReport = {
    id: 'rep_test_pop_01',
    status: 'APPROVED',
    confidence_score: 0.98,
    gps_lat: 55.7928,
    gps_lon: 37.5432,
    stamp_hash: 'OOH-TEST-STAMP-2026',
    ai_reasoning: 'Тестовая инспекция подтвердила 100% читаемость постера и корректность монтажа.',
    captured_at: new Date().toISOString()
  };

  const sampleConstruction = {
    code: 'BB-MOW-0104',
    type: 'Билборд 3х6',
    side: 'Сторона А',
    address_location: 'г. Москва, Ленинградский пр-кт, 37 к2'
  };

  const htmlAct = PdfReportService.generateReportHtmlAct({
    report: sampleReport,
    construction: sampleConstruction,
    supplier: { name: 'ООО «МедиаАутдор Групп»' },
    specialist: { full_name: 'Абдулазиз Каримов' }
  });

  assert.ok(htmlAct.includes('АКТ КОНТРОЛЯ РАЗМЕЩЕНИЯ'), 'HTML Act must contain official title');
  assert.ok(htmlAct.includes('BB-MOW-0104'), 'HTML Act must contain construction code');
  assert.ok(htmlAct.includes('ВЕРИФИЦИРОВАНО ИИ'), 'HTML Act must reflect APPROVED state badge');
  assert.ok(htmlAct.includes('Ленинградский пр-кт'), 'HTML Act must contain location address');
  console.log('✓ Proof of Performance (PoP) Act generation passed');
}

console.log('--- ALL SYSTEM TESTS PASSED SUCCESSFULLY (14/14) ---');


