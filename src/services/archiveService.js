import { archiveRepository } from '../repositories/archiveRepository.js';

class ArchiveService {
  getArchiveStructure() {
    return archiveRepository.getFolderTree();
  }
}

export const archiveService = new ArchiveService();
