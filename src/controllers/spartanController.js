import { spartanWorkflowService } from '../services/spartanWorkflowService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';

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
      let user = databaseRepository.getUserByTelegramId(telegram_user.id);
      
      if (!user) {
        // Automatic registration for new field workers
        const newUserId = `usr_spec_${Date.now()}`;
        const newUser = {
          id: newUserId,
          telegram_id: telegram_user.id,
          username: telegram_user.username || '',
          full_name: `${telegram_user.first_name || ''} ${telegram_user.last_name || ''}`.trim(),
          role: 'Specialist',
          supplier_id: 'sup_01', // Default supplier for now
          is_active: true,
          created_at: new Date().toISOString()
        };
        
        databaseRepository.saveUser(newUser); // We need to add this method to the DB repo
        
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
        captureTimestamp: captureTimestamp || new Date().toISOString(),
        captureSource: captureSource || 'camera_sensor',
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
}
