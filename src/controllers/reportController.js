import { reportService } from '../services/reportService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';
import { PdfReportService } from '../services/pdfReportService.js';

export class ReportController {
  static async getReports(req, res) {
    try {
      const dbConstructions = await databaseRepository.getConstructions();
      const dbSuppliers = await databaseRepository.getSuppliers();
      const dbReports = await databaseRepository.getReports();
      const constructionsMap = new Map((dbConstructions || []).map(c => [c.id, c]));
      const suppliersMap = new Map((dbSuppliers || []).map(s => [s.id, s]));

      let reports = (dbReports || []).map(r => {
        const c = constructionsMap.get(r.construction_id) || {};
        const s = suppliersMap.get(r.supplier_id || c.supplier_id) || {};
        return {
          id: r.id,
          construction: {
            code: c.code || r.construction_code || r.construction_id || '—',
            side: c.side || 'Сторона А',
            type: c.type || 'Билборд'
          },
          location: {
            address: c.address_location || 'г. Москва',
            city: 'Москва'
          },
          contractor: {
            id: s.id || r.supplier_id,
            name: s.name || 'Поставщик'
          },
          status: r.status || 'PENDING',
          confidence_score: r.confidence_score ?? 1.0,
          captured_at: r.captured_at || r.created_at,
          displayDate: r.captured_at ? new Date(r.captured_at).toLocaleDateString('ru-RU') : '—',
          displayTime: r.captured_at ? new Date(r.captured_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—',
          photo_url: r.photo_url || null,
          issues: r.detected_issues || [],
          reasoning: r.ai_reasoning || ''
        };
      });

      if (req.query.status) {
        reports = reports.filter(r => r.status.toUpperCase() === req.query.status.toUpperCase());
      }
      if (req.query.search) {
        const q = req.query.search.toLowerCase().trim();
        reports = reports.filter(r =>
          r.construction.code.toLowerCase().includes(q) ||
          r.location.address.toLowerCase().includes(q) ||
          r.contractor.name.toLowerCase().includes(q)
        );
      }

      res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async createReport(req, res) {
    try {
      const saved = await databaseRepository.saveReport(req.body);
      res.status(201).json({ success: true, data: saved });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async getReportById(req, res) {
    try {
      const { id } = req.params;
      const dbReports = await databaseRepository.getReports();
      const report = dbReports.find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async updateReport(req, res) {
    try {
      const { id } = req.params;
      const dbReports = await databaseRepository.getReports();
      const report = dbReports.find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      Object.assign(report, req.body);
      await databaseRepository.saveReport(report);
      res.json({ success: true, message: 'Значения отчета успешно обновлены', data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async verifyReport(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const dbReports = await databaseRepository.getReports();
      const report = dbReports.find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      report.status = status || 'APPROVED';
      await databaseRepository.saveReport(report);
      res.json({ success: true, message: 'Статус верификации обновлен', data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async bulkVerify(req, res) {
    try {
      const { reportIds, status, comment } = req.body;
      if (!Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Массив reportIds пуст или не передан' });
      }
      if (!status || !['APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
        return res.status(400).json({ success: false, error: 'Некорректный статус. Ожидается APPROVED или REJECTED' });
      }
      
      const count = await databaseRepository.updateReportsBulk(reportIds, status.toUpperCase(), comment);
      res.json({ success: true, message: `Успешно обновлено отчетов: ${count}`, count });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async deleteReport(req, res) {
    try {
      const { id } = req.params;
      if (typeof databaseRepository.deleteReport === 'function') {
        await databaseRepository.deleteReport(id);
      } else {
        await databaseRepository._query('DELETE FROM reports WHERE id = $1', [id]);
      }
      res.json({ success: true, message: 'Отчет успешно удален' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getContractors(req, res) {
    try {
      const suppliers = await databaseRepository.getSuppliers();
      res.json({ success: true, data: suppliers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getConstructions(req, res) {
    try {
      const constructions = await databaseRepository.getConstructions();
      res.json({ success: true, data: constructions });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getStats(req, res) {
    try {
      const reports = await databaseRepository.getReports();
      const suppliers = await databaseRepository.getSuppliers();
      const constructions = await databaseRepository.getConstructions();
      
      const totalReports = reports.length;
      const verifiedReports = reports.filter(r => (r.status || '').toUpperCase() === 'APPROVED').length;
      const rejectedReports = reports.filter(r => (r.status || '').toUpperCase() === 'REJECTED').length;
      const pendingReports = reports.filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
      const totalContractors = (suppliers || []).length;
      const totalConstructions = (constructions || []).length;

      res.json({
        success: true,
        data: {
          totalReports,
          verifiedReports,
          rejectedReports,
          pendingReports,
          totalContractors,
          totalConstructions
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async exportPdfDossier(req, res) {
    try {
      const supplierId = req.query.supplierId;
      const dbReports = await databaseRepository.getReports();
      const dbConstructions = await databaseRepository.getConstructions();
      const dbSuppliers = await databaseRepository.getSuppliers();
      
      let reports = dbReports || [];
      if (supplierId) reports = reports.filter(r => r.supplier_id === supplierId);
      
      const constructionsMap = new Map((dbConstructions || []).map(c => [c.id, c]));
      const supplier = (dbSuppliers || []).find(s => s.id === supplierId) || { name: 'Все поставщики' };

      const pdfBuffer = await PdfReportService.generateDossierPdf(reports, constructionsMap, supplier);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="ooh_reports_dossier.pdf"');
      res.status(200).send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async exportCSV(req, res) {
    try {
      const dbReports = await databaseRepository.getReports();
      const dbConstructions = await databaseRepository.getConstructions();
      const dbSuppliers = await databaseRepository.getSuppliers();
      const constructionsMap = new Map((dbConstructions || []).map(c => [c.id, c]));
      const suppliersMap = new Map((dbSuppliers || []).map(s => [s.id, s]));

      const header = 'ID;Поставщик;Конструкция;Сторона;Тип;Адрес;Дата съемки;Статус;Уверенность AI;GPS Координаты;Ссылка на фото\n';
      const rows = (dbReports || []).map(r => {
        const c = constructionsMap.get(r.construction_id) || {};
        const s = suppliersMap.get(r.supplier_id || c.supplier_id) || {};
        const dateStr = r.captured_at ? new Date(r.captured_at).toLocaleString('ru-RU') : '';
        const coords = r.gps_lat && r.gps_lon ? `${r.gps_lat}, ${r.gps_lon}` : '';
        return [
          r.id,
          s.name || '',
          c.code || r.construction_code || '',
          c.side || '',
          c.type || '',
          `"${(c.address_location || '').replace(/"/g, '""')}"`,
          dateStr,
          r.status || 'PENDING',
          r.confidence_score ? `${Math.round(r.confidence_score * 100)}%` : '',
          coords,
          r.photo_url || ''
        ].join(';');
      });

      const csvContent = '\uFEFF' + header + rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ooh_reports_registry.csv"');
      res.status(200).send(Buffer.from(csvContent, 'utf-8'));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getUsers(req, res) {
    try {
      const suppliers = await databaseRepository.getSuppliers();
      const suppliersMap = new Map(suppliers.map(s => [s.id, s.name]));

      let users = await databaseRepository.getUsers();
      users = users.map(u => ({
        ...u,
        full_name: u.full_name || u.name,
        is_active: u.is_active ?? u.active ?? false,
        supplier_name: suppliersMap.get(u.supplier_id) || 'Не назначен'
      }));
      res.json({ success: true, count: users.length, data: users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getUser(req, res) {
    try {
      const { id } = req.params;
      const user = await databaseRepository.getUserById(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      res.json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const user = await databaseRepository.getUserById(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      if (req.body.role !== undefined) user.role = req.body.role;
      if (req.body.is_active !== undefined) {
        user.is_active = Boolean(req.body.is_active);
        user.active = Boolean(req.body.is_active);
      }
      if (req.body.supplier_id !== undefined) user.supplier_id = req.body.supplier_id;
      if (req.body.full_name !== undefined) user.full_name = req.body.full_name;
      await databaseRepository.saveUser(user);
      res.json({ success: true, message: 'Данные пользователя успешно обновлены', data: user });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}
