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

  static getFile(req, res) {
    try {
      const { org, month, file } = req.params;
      const filePath = archiveService.getFilePath(org, month, file);
      if (!filePath) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Файл не найден' } });
      }
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
