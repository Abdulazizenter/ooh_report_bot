import { kamProgramService } from '../services/kamProgramService.js';

export class KamProgramController {
  static getPrograms(req, res) {
    try {
      const { contractorId } = req.query;
      const data = kamProgramService.getPrograms(contractorId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static saveProgram(req, res) {
    try {
      const result = kamProgramService.registerOrUpdateProgram(req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}
