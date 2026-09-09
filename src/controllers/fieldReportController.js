import { fieldReportService } from '../services/fieldReportService.js';

export class FieldReportController {
  static async submitRealTimeReport(req, res) {
    try {
      const result = await fieldReportService.processRealTimeSubmission(req.body);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.status(201).json(result);
    } catch (err) {
      console.error('FieldReportController error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
