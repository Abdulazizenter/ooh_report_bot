import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const STORAGE_ROOT = isVercel ? '/tmp/storage' : path.resolve(__dirname, '../../storage');

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

// Utility to sanitize folder name for filesystem safety while preserving readable Cyrillic/Latin
export function sanitizeFolderName(name) {
  if (!name) return 'Неизвестный_Поставщик';
  return name
    .replace(/[«»"'\/\\]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

class ArchiveRepository {
  constructor() {
    this.rootPath = STORAGE_ROOT;
    this._initSampleStructure();
  }

  _initSampleStructure() {
    // Ensure initial directory structure exists for the current month
    const sampleDirs = [
      { org: 'ООО_МедиаАутдор_Групп', month: '2026-09' },
      { org: 'ООО_Русс_Аутдор_Монтаж', month: '2026-09' },
      { org: 'ИП_Смирнов_Наружная_Реклама', month: '2026-09' }
    ];

    sampleDirs.forEach(({ org, month }) => {
      const dir = path.join(this.rootPath, org, month);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  saveReportArtifact({ contractorName, monthString, fileName, bufferOrBase64, metadata }) {
    const safeOrgName = sanitizeFolderName(contractorName);
    const targetMonth = monthString || new Date().toISOString().slice(0, 7); // e.g. "2026-09"
    const targetDir = path.join(this.rootPath, safeOrgName, targetMonth);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, fileName);

    let fileBuffer;
    if (typeof bufferOrBase64 === 'string') {
      const cleanBase64 = bufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
      fileBuffer = Buffer.from(cleanBase64, 'base64');
    } else {
      fileBuffer = bufferOrBase64;
    }

    fs.writeFileSync(filePath, fileBuffer);

    // Write sidecar JSON metadata for traceability
    const metaPath = path.join(targetDir, `${path.parse(fileName).name}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    const relativeWebPath = `/storage/${safeOrgName}/${targetMonth}/${fileName}`;

    return {
      success: true,
      folderPath: `${safeOrgName}/${targetMonth}`,
      fileName,
      fullDiskPath: filePath,
      relativeWebPath,
      fileSizeBytes: fileBuffer.length,
      savedAt: new Date().toISOString()
    };
  }

  getFolderTree() {
    const result = [];
    if (!fs.existsSync(this.rootPath)) return result;

    const orgDirs = fs.readdirSync(this.rootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    for (const org of orgDirs) {
      const orgPath = path.join(this.rootPath, org.name);
      const monthDirs = fs.readdirSync(orgPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

      const months = [];
      for (const month of monthDirs) {
        const monthPath = path.join(orgPath, month.name);
        const files = fs.readdirSync(monthPath)
          .filter(f => !f.endsWith('.meta.json'));

        months.push({
          month: month.name,
          filesCount: files.length,
          files: files.map(f => {
            const fPath = path.join(monthPath, f);
            const stat = fs.statSync(fPath);
            return {
              fileName: f,
              sizeBytes: stat.size,
              createdAt: stat.mtime.toISOString(),
              url: `/storage/${org.name}/${month.name}/${f}`
            };
          })
        });
      }

      result.push({
        contractorFolder: org.name,
        months
      });
    }

    return result;
  }
}

export const archiveRepository = new ArchiveRepository();
