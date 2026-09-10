import { reportService } from '../services/reportService.js';

export class ReportController {
  static getReports(req, res) {
    try {
      const filters = {
        contractorId: req.query.contractorId,
        city: req.query.city,
        constructionCode: req.query.constructionCode,
        status: req.query.status,
        search: req.query.search,
        sortBy: req.query.sortBy
      };
      const reports = reportService.getOrderedReports(filters);
      res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static createReport(req, res) {
    try {
      const report = reportService.createReport(req.body);
      res.status(201).json({ success: true, data: report });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static getReportById(req, res) {
    try {
      const { id } = req.params;
      const report = reportService.getReportById(id);
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
      const requestingUser = {
        id: req.headers['x-user-id'] || 'usr_admin',
        role: req.headers['x-user-role'] || 'admin',
        name: req.headers['x-user-name'] ? decodeURIComponent(req.headers['x-user-name']) : 'Главный Администратор OOH'
      };

      const updated = reportService.updateReport(id, req.body, requestingUser);
      res.json({ success: true, message: 'Значения отчета успешно обновлены', data: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static verifyReport(req, res) {
    try {
      const { id } = req.params;
      const { status, notes, auditor } = req.body;
      const auditorName = auditor || (req.headers['x-user-name'] ? decodeURIComponent(req.headers['x-user-name']) : 'Главный Администратор OOH');
      const updated = reportService.verifyReport(id, status, notes, auditorName);
      res.json({ success: true, message: 'Статус верификации обновлен', data: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static deleteReport(req, res) {
    try {
      const { id } = req.params;
      const deleted = reportService.deleteReport(id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Отчет не найден' });
      }
      res.json({ success: true, message: 'Отчет успешно удален' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getContractors(req, res) {
    try {
      const contractors = reportService.getContractors();
      res.json({ success: true, data: contractors });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getConstructions(req, res) {
    try {
      const constructions = reportService.getConstructions();
      res.json({ success: true, data: constructions });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getStats(req, res) {
    try {
      const stats = reportService.getStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static exportCSV(req, res) {
    try {
      const csv = reportService.exportCSV();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ooh_reports_registry.csv"');
      // UTF-8 BOM for Microsoft Excel compatibility
      res.send('\uFEFF' + csv);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getUsers(req, res) {
    try {
      const users = reportService.getUsers();
      res.json({ success: true, count: users.length, data: users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static getUser(req, res) {
    try {
      const { id } = req.params;
      const user = reportService.getUserById(id);
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
      const requestingUser = {
        id: req.headers['x-user-id'] || 'usr_admin',
        role: req.headers['x-user-role'] || 'admin',
        name: req.headers['x-user-name'] ? decodeURIComponent(req.headers['x-user-name']) : 'Главный Администратор OOH'
      };

      const updated = reportService.updateUser(id, req.body, requestingUser);
      res.json({ success: true, message: 'Данные пользователя успешно обновлены', data: updated });
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

