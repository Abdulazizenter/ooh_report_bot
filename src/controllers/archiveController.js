import { archiveService } from '../services/archiveService.js';

export class ArchiveController {
  static getFolders(req, res) {
    try {
      const data = archiveService.getArchiveStructure();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
