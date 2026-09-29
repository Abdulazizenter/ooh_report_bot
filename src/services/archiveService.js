import { archiveRepository } from '../repositories/archiveRepository.js';

class ArchiveService {
  getArchiveStructure() {
    return archiveRepository.getFolderTree();
  }

  getFilePath(org, month, file) {
    return archiveRepository.getFile(org, month, file);
  }
}

export const archiveService = new ArchiveService();
