import { reportService } from '../services/reportService.js';
import { databaseRepository } from '../repositories/databaseRepository.js';

export class ReportController {
  static getReports(req, res) {
    try {
      const db = databaseRepository._readDb();
      const constructionsMap = new Map((db.constructions || []).map(c => [c.id, c]));
      const suppliersMap = new Map((db.suppliers || []).map(s => [s.id, s]));

      let reports = (db.reports || []).map(r => {
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

  static createReport(req, res) {
    try {
      const saved = databaseRepository.saveReport(req.body);
      res.status(201).json({ success: true, data: saved });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static getReportById(req, res) {
    try {
      const { id } = req.params;
      const report = (databaseRepository._readDb().reports || []).find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static updateReport(req, res) {
    try {
      const { id } = req.params;
      const report = (databaseRepository._readDb().reports || []).find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      Object.assign(report, req.body);
      databaseRepository.saveReport(report);
      res.json({ success: true, message: 'Значения отчета успешно обновлены', data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static verifyReport(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const report = (databaseRepository._readDb().reports || []).find(r => r.id === id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      report.status = status || 'APPROVED';
      databaseRepository.saveReport(report);
      res.json({ success: true, message: 'Статус верификации обновлен', data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static deleteReport(req, res) {
    try {
      const { id } = req.params;
      const db = databaseRepository._readDb();
      const idx = (db.reports || []).findIndex(r => r.id === id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      db.reports.splice(idx, 1);
      res.json({ success: true, message: 'Отчет успешно удален' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getContractors(req, res) {
    try {
      const suppliers = databaseRepository.getSuppliers();
      res.json({ success: true, data: suppliers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getConstructions(req, res) {
    try {
      const constructions = databaseRepository.getConstructions();
      res.json({ success: true, data: constructions });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getStats(req, res) {
    try {
      const db = databaseRepository._readDb();
      const reports = db.reports || [];
      const totalReports = reports.length;
      const verifiedReports = reports.filter(r => (r.status || '').toUpperCase() === 'APPROVED').length;
      const rejectedReports = reports.filter(r => (r.status || '').toUpperCase() === 'REJECTED').length;
      const pendingReports = reports.filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
      const totalContractors = (db.suppliers || []).length;
      const totalConstructions = (db.constructions || []).length;

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

  static exportCSV(req, res) {
    try {
      const db = databaseRepository._readDb();
      const constructionsMap = new Map((db.constructions || []).map(c => [c.id, c]));
      const suppliersMap = new Map((db.suppliers || []).map(s => [s.id, s]));

      const header = 'ID;Поставщик;Конструкция;Сторона;Тип;Адрес;Дата съемки;Статус;Уверенность AI;GPS Координаты;Ссылка на фото\n';
      const rows = (db.reports || []).map(r => {
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

  static getUsers(req, res) {
    try {
      const suppliers = databaseRepository.getSuppliers();
      const suppliersMap = new Map(suppliers.map(s => [s.id, s.name]));

      const users = databaseRepository.getUsers().map(u => ({
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

  static getUser(req, res) {
    try {
      const { id } = req.params;
      const user = databaseRepository.getUserById(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      res.json({ success: true, data: user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static updateUser(req, res) {
    try {
      const { id } = req.params;
      const user = databaseRepository.getUserById(id);
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
      databaseRepository.saveUser(user);
      res.json({ success: true, message: 'Данные пользователя успешно обновлены', data: user });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static exportCSV(req, res) {
    try {
      const reports = reportService.getAllReports();
      
      const csvHeader = 'ID,Contractor,Representative,City,Address,Code,Side,Type,Lighting,Date,Time,Status,Verification,Hash,PhotoURL\n';
      const csvRows = reports.map(r => {
        const contractorName = (r.contractor?.name || '').replace(/,/g, '');
        const repName = (r.contractor?.representative || '').replace(/,/g, '');
        const city = (r.location?.city || '').replace(/,/g, '');
        const address = (r.location?.address || '').replace(/,/g, '');
        const code = r.construction?.code || '';
        const side = r.construction?.side || '';
        const type = r.construction?.type || '';
        const light = r.construction?.lightingType || '';
        const photoUrl = r.photoUrl || (r.photos && r.photos[0]) || '';
        
        return `${r.id},${contractorName},${repName},${city},${address},${code},${side},${type},${light},${r.displayDate},${r.displayTime},${r.status},${r.verificationStatus},${r.stampHash || ''},${photoUrl}`;
      });

      const csvData = csvHeader + csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ooh_reports_export.csv"');
      res.status(200).send(Buffer.from('\uFEFF' + csvData, 'utf-8')); // Add BOM for Excel
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

