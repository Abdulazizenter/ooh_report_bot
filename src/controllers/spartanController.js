import { spartanWorkflowService } from '../services/spartanWorkflowService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';
import { normalizeWorkbook } from '../services/excelImportService.js';
import { validateTelegramInitData } from '../utils/telegramAuth.js';
import fs from 'fs';
import { PdfReportService } from '../services/pdfReportService.js';

export class SpartanController {
  static async syncWithCloud(req, res) {
    try {
      if (!req.workspace) {
        return res.status(401).json({ success: false, error: 'No workspace auth provided' });
      }

      const ssId = await req.workspace.findOrCreateDatabaseSpreadsheet();

      // We read from Sheets
      const [sheetUsers, sheetSuppliers, sheetConstructions, sheetReports] = await Promise.all([
        req.workspace.readSheet(ssId, 'Users'),
        req.workspace.readSheet(ssId, 'Suppliers'),
        req.workspace.readSheet(ssId, 'Constructions'),
        req.workspace.readSheet(ssId, 'Reports')
      ]);

      const isCloudEmpty = 
        sheetUsers.length === 0 && 
        sheetSuppliers.length === 0 && 
        sheetConstructions.length === 0 && 
        sheetReports.length === 0;

      if (isCloudEmpty) {
        // Cloud is empty, seed it with local DB
        const users = await databaseRepository.getUsers();
        const suppliers = await databaseRepository.getSuppliers();
        const constructions = await databaseRepository.getConstructions();
        const reports = await databaseRepository.getReports();
        
        await Promise.all([
          req.workspace.clearAndWriteSheet(ssId, 'Users', users || []),
          req.workspace.clearAndWriteSheet(ssId, 'Suppliers', suppliers || []),
          req.workspace.clearAndWriteSheet(ssId, 'Constructions', constructions || []),
          req.workspace.clearAndWriteSheet(ssId, 'Reports', reports || [])
        ]);

        return res.json({ success: true, message: 'Cloud database seeded from local.' });
      } else {
        // Cloud has data, overwrite local DB
        await databaseRepository.clearDb();

        const newUsers = sheetUsers.map(u => ({ ...u, telegram_id: Number(u.telegram_id) }));
        for (const u of newUsers) await databaseRepository.saveUser(u);
        for (const s of sheetSuppliers) await databaseRepository.saveSupplier(s);

        const constrBatches = {};
        for (const c of sheetConstructions) {
          const key = `${c.supplier_id}_${c.month_period || '2026-09'}`;
          if (!constrBatches[key]) constrBatches[key] = { supplier_id: c.supplier_id, month_period: c.month_period || '2026-09', constructions: [] };
          constrBatches[key].constructions.push(c);
        }
        for (const b of Object.values(constrBatches)) await databaseRepository.saveConstructionsBatch(b);

        const newReports = sheetReports.map(r => ({
          id: r.id,
          construction_id: r.constructionId,
          specialist_id: r.specialist_id || 'system',
          supplier_id: r.contractorId,
          telegram_id: Number(r.telegram_id),
          captured_at: r.displayDate && r.displayTime ? `${r.displayDate} ${r.displayTime}` : new Date().toISOString(),
          status: r.status,
          photo_url: r.photo_url,
          stamp_hash: r.stamp_hash,
          detected_issues: r.issues ? r.issues.split(', ') : [],
          ai_reasoning: r.reasoning
        }));

        for (const r of newReports) await databaseRepository.saveReport(r);

        return res.json({ success: true, message: 'Local database updated from cloud.' });
      }
    } catch (err) {
      console.error('Cloud Sync Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async authenticateUser(req, res) {
    try {
      await databaseRepository.waitUntilReady();
      let rawUser = req.body.telegram_user || req.body.user || req.body;
      
      // If Telegram WebApp initData is provided, cryptographically verify it
      if (req.body.initData) {
        const verifiedUser = validateTelegramInitData(req.body.initData, process.env.TELEGRAM_BOT_TOKEN);
        if (verifiedUser) {
          rawUser = verifiedUser;
        } else if (process.env.TELEGRAM_BOT_TOKEN) {
          return res.status(401).json({ success: false, error: 'Поддельная подпись Telegram WebApp' });
        }
      }

      const tgIdStr = String(rawUser?.id || rawUser?.telegram_id || '');
      if (!tgIdStr || tgIdStr === 'undefined' || tgIdStr === 'null') {
        return res.status(400).json({ success: false, error: 'Некорректный Telegram user: отсутствует ID' });
      }
      const tgId = Number(tgIdStr);
      let user = await databaseRepository.getUserByTelegramId(tgIdStr);
      
      const username = (rawUser.username || '').toLowerCase();
      const ownerUsernames = ['abdulazizenter', 'abdulaziz_ibt'];
      const isOwner = tgId === 85993905 || (username && ownerUsernames.includes(username));
      const allUsers = await databaseRepository.getUsers();
      const hasActiveAdmin = allUsers.some(u => u.role === 'admin' && u.is_active !== false);

      if (!user) {
        // Automatic registration for new users
        const shouldBeAdmin = isOwner || !hasActiveAdmin;
        const requestedRole = rawUser.requested_role || rawUser.role || (shouldBeAdmin ? 'admin' : 'pending');
        const newUserId = shouldBeAdmin ? `usr_admin_${Date.now()}` : `usr_${requestedRole}_${Date.now()}`;
        const fullName = `${rawUser.first_name || ''} ${rawUser.last_name || ''}`.trim() || rawUser.name || rawUser.full_name || 'Пользователь OOH';
        const newUser = {
          id: newUserId,
          telegram_id: tgId,
          username: rawUser.username || '',
          full_name: fullName,
          name: fullName,
          role: shouldBeAdmin ? 'admin' : (requestedRole === 'client' ? 'client' : (requestedRole === 'contractor_lead' ? 'contractor_lead' : (requestedRole === 'specialist' ? 'specialist' : 'pending'))),
          supplier_id: shouldBeAdmin ? 'sup_01' : (rawUser.supplier_id || null),
          organization: rawUser.organization || (shouldBeAdmin ? 'Единый Центр Мониторинга OOH' : ''),
          is_active: shouldBeAdmin ? true : false,
          created_at: new Date().toISOString()
        };
        
        await databaseRepository.saveUser(newUser);
        
        if (req.workspace) {
          // Attempt to sync to cloud if auth provided
          try {
            const ssId = await req.workspace.findOrCreateDatabaseSpreadsheet();
            await req.workspace.appendRow(ssId, 'Users', newUser);
          } catch(e) {
            console.warn("Cloud sync failed during registration", e);
          }
        }
        
        user = newUser;
      } else if (isOwner) {
        // Auto-promote owner if previously created as pending
        user.role = 'admin';
        user.is_active = true;
        if (!user.supplier_id) user.supplier_id = 'sup_01';
        await databaseRepository.saveUser(user);
      }
      
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async claimAdmin(req, res) {
    try {
      const { userId, actorUserId } = req.body;
      if (!req.auth?.userId || req.auth.userId !== actorUserId) {
        return res.status(403).json({ success: false, error: 'Недействительная сессия администратора' });
      }
      const actor = await databaseRepository.getUserById(actorUserId);
      if (!actor || actor.role !== 'admin' || actor.is_active === false) return res.status(403).json({ success: false, error: 'Только активный администратор может назначать роль' });
      const allUsers = await databaseRepository.getUsers();
      const userIndex = allUsers.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      const user = allUsers[userIndex];
      user.role = 'admin';
      user.is_active = true;
      
      await databaseRepository.saveUser(user);
      
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getMe(req, res) {
    try {
      const user = await databaseRepository.getUserById(req.auth.userId);
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getUserProfile(req, res) {
    try {
      const { telegramId } = req.params;
      const user = await databaseRepository.getUserByTelegramId(telegramId);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      const supplier = user.supplier_id ? await databaseRepository.getSupplierById(user.supplier_id) : null;
      res.json({ user, supplier });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getNearbyConstructions(req, res) {
    try {
      const { lat, lon, telegramId, month } = req.query;
      const list = await spartanWorkflowService.getNearbyTasks({
        latitude: lat,
        longitude: lon,
        specialistTelegramId: telegramId,
        monthPeriod: month || null
      });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getJobStatus(req, res) {
    const { jobId } = req.params;
    const status = spartanWorkflowService.getJobStatus(jobId);
    if (status.status === 'NOT_FOUND') return res.status(404).json(status);
    res.json(status);
  }

  static async submitSpecialistReport(req, res) {
    try {
      const {
        telegramId,
        constructionId,
        mediaBase64,
        mediaUrl,
        mediaType,
        latitude,
        longitude,
        captureTimestamp,
        captureSource
      } = req.body;

      if (!constructionId || (!mediaBase64 && !mediaUrl)) {
        return res.status(400).json({
          status: 'REJECTED',
          confidence_score: 1.0,
          detected_issues: ['Отсутствует ID конструкции или медиа-файл.'],
          reasoning: 'Необходимо выбрать конструкцию из гео-списка и сделать снимок камерой.'
        });
      }

      const result = await spartanWorkflowService.submitSpecialistReportAsync({
        telegramId,
        constructionId,
        mediaBase64,
        mediaUrl,
        mediaType,
        latitude,
        longitude,
        captureTimestamp,
        captureSource,
        workspace: req.workspace
      });

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({
        status: 'REJECTED',
        confidence_score: 1.0,
        detected_issues: [err.message],
        reasoning: 'Системная ошибка при обработке отчета. Повторите попытку.'
      });
    }
  }

  static async getKamDashboard(req, res) {
    try {
      const { month } = req.query;
      const dashboard = await spartanWorkflowService.getKamDashboard(month || '2026-09');
      res.json(dashboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async uploadKamTz(req, res) {
    try {
      const { supplierId, monthPeriod, fileName, constructions, defaultCriteria } = req.body;
      const result = await spartanWorkflowService.uploadKamTzPackage({
        supplierId,
        monthPeriod: monthPeriod || '2026-09',
        fileName: fileName || 'tz_upload.zip',
        constructions: constructions || [],
        defaultCriteria
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async ensureDatabase(req, res) {
    try { if (!req.workspace) return res.status(503).json({ success: false, error: 'Google Workspace не настроен' }); const result = await req.workspace.findOrCreateDatabaseSpreadsheet(); res.json({ success: true, data: { spreadsheetId: result, schemaVersion: '2' } }); } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  }

  static async previewImport(req, res) {
    try { if (!req.file) return res.status(400).json({ success: false, error: 'Файл Excel не передан' }); const preview = await normalizeWorkbook(fs.readFileSync(req.file.path), { supplierId: req.body.supplierId, period: req.body.period }); const token = await databaseRepository.recordImportRun({ supplier_id: req.body.supplierId || '', month_period: req.body.period || '', file_name: req.file.originalname, checksum: preview.checksum, status: 'PREVIEW', valid_rows: preview.summary.valid, warning_rows: preview.summary.warnings, error_rows: preview.summary.errors, preview_rows: preview.valid }); res.json({ success: true, data: { ...preview, importRunId: token.id } }); } catch (err) { res.status(400).json({ success: false, error: err.message }); }
  }

  static async commitImport(req, res) {
    try {
      const { importRunId, supplierId, monthPeriod } = req.body;
      const run = await databaseRepository.getImportRuns().find(item => item.id === importRunId);
      if (!run || run.status !== 'PREVIEW' || run.supplier_id !== supplierId || run.month_period !== monthPeriod) return res.status(409).json({ success: false, error: 'Предпросмотр импорта устарел или не совпадает с параметрами.' });
      const constructions = Array.isArray(run.preview_rows) ? run.preview_rows : [];
      const result = await databaseRepository.saveConstructionsBatch({ supplier_id: supplierId, month_period: monthPeriod, constructions });
      await databaseRepository.recordImportRun({ ...run, id: importRunId, status: 'COMMITTED', committed_at: new Date().toISOString() });
      if (req.workspace) { const ssId = await req.workspace.findOrCreateDatabaseSpreadsheet(); await req.workspace.clearAndWriteSheet(ssId, 'Constructions', databaseRepository.getConstructions()); }
      res.json({ success: true, data: result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  }

  static async getSupplierReport(req, res) { try { const data = await databaseRepository.getSupplierReport(req.params.supplierId, req.query.period, req.query.status); if (!data) return res.status(404).json({ success: false, error: 'Поставщик не найден' }); res.json({ success: true, data }); } catch (err) { res.status(500).json({ success: false, error: err.message }); } }

  static async adminClearDatabase(req, res) {
    try {
      databaseRepository.clearDb();
      res.json({ success: true, message: 'Локальная база данных успешно очищена' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async adminImportConstructions(req, res) {
    try {
      const { constructions } = req.body;
      if (!constructions || !Array.isArray(constructions)) {
        return res.status(400).json({ success: false, error: 'Ожидается массив constructions' });
      }
      
      const batches = {};
      for (const c of constructions) {
        const sid = c.supplier_id || 'sup_01';
        const mp = c.month_period || '2026-09';
        const key = `${sid}_${mp}`;
        if (!batches[key]) batches[key] = { supplier_id: sid, month_period: mp, constructions: [] };
        
        batches[key].constructions.push({
          id: c.id || `cst_${Date.now()}_${Math.floor(Math.random()*1000)}`,
          ...c
        });
      }

      for (const b of Object.values(batches)) {
        await databaseRepository.saveConstructionsBatch(b);
      }
      
      res.json({ success: true, message: `Успешно загружено ${constructions.length} конструкций` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async generateReportAct(req, res) {
    try {
      await databaseRepository.waitUntilReady();
      const report = await databaseRepository.getReportById(req.params.id);
      if (!report) return res.status(404).send('<h1>404 — Отчет не найден</h1>');

      const construction = await databaseRepository.getConstructionById(report.construction_id);
      const supplier = await databaseRepository.getSupplierById(report.supplier_id);
      const specialist = await databaseRepository.getUserById(report.specialist_id);

      const html = PdfReportService.generateReportHtmlAct({
        report,
        construction,
        supplier,
        specialist
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).send('<h1>500 — Ошибка генерации акта: ' + err.message + '</h1>');
    }
  }
}
