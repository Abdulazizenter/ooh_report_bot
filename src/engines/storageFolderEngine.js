import { archiveRepository, sanitizeFolderName } from '../repositories/archiveRepository.js';

export class StorageFolderEngine {
  /**
   * Generates canonical folder and filename according to user specification:
   * "сохраняет в папке именуемым наименованием поставщиком под тот месяц за который отчет направляется"
   */
  static resolveStorageDestination({ contractorName, constructionCode, constructionSide, reportDate }) {
    const safeContractorName = sanitizeFolderName(contractorName);
    const dateObj = reportDate ? new Date(reportDate) : new Date();

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const monthString = `${year}-${month}`; // e.g. "2026-09"

    const cleanCode = (constructionCode || 'CONST').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanSide = (constructionSide || 'SideA').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 10);
    const timeStampStr = dateObj.toISOString().replace(/[-:T]/g, '').slice(0, 14);

    const fileName = `${cleanCode}_${cleanSide}_${timeStampStr}.jpg`;

    return {
      safeContractorName,
      monthString,
      fileName,
      relativeFolder: `${safeContractorName}/${monthString}`
    };
  }

  /**
   * Saves field artifact into the determined supplier/month folder
   */
  static persistFieldArtifact({ contractorName, constructionCode, constructionSide, reportDate, mediaBase64, metadata }) {
    const dest = this.resolveStorageDestination({
      contractorName,
      constructionCode,
      constructionSide,
      reportDate
    });

    const saveResult = archiveRepository.saveReportArtifact({
      contractorName: dest.safeContractorName,
      monthString: dest.monthString,
      fileName: dest.fileName,
      bufferOrBase64: mediaBase64,
      metadata: {
        ...metadata,
        persistedFolder: dest.relativeFolder,
        persistedFileName: dest.fileName
      }
    });

    return {
      ...dest,
      ...saveResult
    };
  }
}
