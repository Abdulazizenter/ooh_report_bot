import { spartanWorkflowService } from '../services/spartanWorkflowService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';

export class SpartanController {
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
        captureSource: captureSource || 'camera_sensor'
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
