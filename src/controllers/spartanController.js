import { spartanWorkflowService } from '../services/spartanWorkflowService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';
import { normalizeWorkbook } from '../services/excelImportService.js';

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
        const localDb = databaseRepository._readDb();
        
        await Promise.all([
          req.workspace.clearAndWriteSheet(ssId, 'Users', localDb.users || []),
          req.workspace.clearAndWriteSheet(ssId, 'Suppliers', localDb.suppliers || []),
          req.workspace.clearAndWriteSheet(ssId, 'Constructions', localDb.constructions || []),
          req.workspace.clearAndWriteSheet(ssId, 'Reports', localDb.reports || [])
        ]);

        return res.json({ success: true, message: 'Cloud database seeded from local.' });
      } else {
        // Cloud has data, overwrite local DB
        // For Reports, we need to map back to original fields if needed, but for now we just store as-is
        const newDb = {
          users: sheetUsers.map(u => ({ ...u, telegram_id: Number(u.telegram_id) })),
          suppliers: sheetSuppliers,
          constructions: sheetConstructions,
          reports: sheetReports.map(r => ({
            id: r.id,
            construction_id: r.constructionId,
            contractorId: r.contractorId,
            supplier_id: r.contractorId,
            telegram_id: Number(r.telegram_id),
            captured_at: r.displayDate && r.displayTime ? `${r.displayDate} ${r.displayTime}` : new Date().toISOString(),
            status: r.status,
            photo_url: r.photo_url,
            stamp_hash: r.stamp_hash,
            detected_issues: r.issues ? r.issues.split(', ') : [],
            ai_reasoning: r.reasoning
          }))
        };

        databaseRepository._writeDb(newDb);

        return res.json({ success: true, message: 'Local database updated from cloud.' });
      }
    } catch (err) {
      console.error('Cloud Sync Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async authenticateUser(req, res) {
    try {
      const { telegram_user } = req.body;
      if (!telegram_user || !Number.isSafeInteger(Number(telegram_user.id))) return res.status(400).json({ success: false, error: 'Некорректный Telegram user' });
      let user = databaseRepository.getUserByTelegramId(telegram_user.id);
      
      if (!user) {
        // Automatic registration for new users
        const newUserId = `usr_pending_${Date.now()}`;
        const newUser = {
          id: newUserId,
          telegram_id: telegram_user.id,
          username: telegram_user.username || '',
          full_name: `${telegram_user.first_name || ''} ${telegram_user.last_name || ''}`.trim(),
          role: 'pending',
          supplier_id: null,
          is_active: false,
          created_at: new Date().toISOString()
        };
        
        databaseRepository.saveUser(newUser);
        
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
      const actor = databaseRepository.getUserById(actorUserId);
      if (!actor || actor.role !== 'admin' || actor.is_active === false) return res.status(403).json({ success: false, error: 'Только активный администратор может назначать роль' });
      const allUsers = databaseRepository.getUsers();
      const userIndex = allUsers.findIndex(u => u.id === userId);
      
      if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      const user = allUsers[userIndex];
      user.role = 'admin';
      user.is_active = true;
      
      databaseRepository.saveUser(user);
      
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getUserProfile(req, res) {
    try {
      const { telegramId } = req.params;
      const user = databaseRepository.getUserByTelegramId(telegramId);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      const supplier = user.supplier_id ? databaseRepository.getSupplierById(user.supplier_id) : null;
      res.json({ user, supplier });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getNearbyConstructions(req, res) {
    try {
      const { lat, lon, telegramId } = req.query;
      const list = spartanWorkflowService.getNearbyTasks({
        latitude: lat,
        longitude: lon,
        specialistTelegramId: telegramId
      });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async submitSpecialistReport(req, res) {
    try {
      const {
        telegramId,
        constructionId,
        mediaBase64,
        mediaType,
        latitude,
        longitude,
        captureTimestamp,
        captureSource
      } = req.body;

      if (!constructionId || !mediaBase64) {
        return res.status(400).json({
          status: 'REJECTED',
          confidence_score: 1.0,
          detected_issues: ['Отсутствует ID конструкции или медиа-файл.'],
          reasoning: 'Необходимо выбрать конструкцию из гео-списка и сделать снимок камерой.'
        });
      }

      const result = await spartanWorkflowService.submitSpecialistReport({
        telegramId,
        constructionId,
        mediaBase64,
        mediaType,
        latitude,
        longitude,
        captureTimestamp,
        captureSource,
        workspace: req.workspace
      });

      res.json(result);
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
      const dashboard = spartanWorkflowService.getKamDashboard(month || '2026-09');
      res.json(dashboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async uploadKamTz(req, res) {
    try {
      const { supplierId, monthPeriod, fileName, constructions, defaultCriteria } = req.body;
      const result = spartanWorkflowService.uploadKamTzPackage({
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
    try { if (!req.file) return res.status(400).json({ success: false, error: 'Файл Excel не передан' }); const preview = normalizeWorkbook(req.file.buffer, { supplierId: req.body.supplierId, period: req.body.period }); const token = databaseRepository.recordImportRun({ supplier_id: req.body.supplierId || '', month_period: req.body.period || '', file_name: req.file.originalname, checksum: preview.checksum, status: 'PREVIEW', valid_rows: preview.summary.valid, warning_rows: preview.summary.warnings, error_rows: preview.summary.errors, preview_rows: preview.valid }); res.json({ success: true, data: { ...preview, importRunId: token.id } }); } catch (err) { res.status(400).json({ success: false, error: err.message }); }
  }

  static async commitImport(req, res) {
    try {
      const { importRunId, supplierId, monthPeriod } = req.body;
      const run = databaseRepository.getImportRuns().find(item => item.id === importRunId);
      if (!run || run.status !== 'PREVIEW' || run.supplier_id !== supplierId || run.month_period !== monthPeriod) return res.status(409).json({ success: false, error: 'Предпросмотр импорта устарел или не совпадает с параметрами.' });
      const constructions = Array.isArray(run.preview_rows) ? run.preview_rows : [];
      const result = databaseRepository.saveConstructionsBatch({ supplier_id: supplierId, month_period: monthPeriod, constructions });
      databaseRepository.recordImportRun({ ...run, id: importRunId, status: 'COMMITTED', committed_at: new Date().toISOString() });
      if (req.workspace) { const ssId = await req.workspace.findOrCreateDatabaseSpreadsheet(); await req.workspace.clearAndWriteSheet(ssId, 'Constructions', databaseRepository.getConstructions()); }
      res.json({ success: true, data: result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  }

  static async getSupplierReport(req, res) { try { const data = databaseRepository.getSupplierReport(req.params.supplierId, req.query.period, req.query.status); if (!data) return res.status(404).json({ success: false, error: 'Поставщик не найден' }); res.json({ success: true, data }); } catch (err) { res.status(500).json({ success: false, error: err.message }); } }

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
      const db = databaseRepository._readDb();
      db.constructions = constructions.map(c => ({
        id: `cst_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        ...c,
        created_at: new Date().toISOString()
      }));
      databaseRepository._writeDb(db);
      res.json({ success: true, message: `Успешно загружено ${constructions.length} конструкций` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
