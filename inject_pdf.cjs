const fs = require('fs');
const path = require('path');

// 1. Update pdfReportService.js
const pdfServicePath = path.join(__dirname, 'src', 'services', 'pdfReportService.js');
let pdfServiceContent = fs.readFileSync(pdfServicePath, 'utf8');

if (!pdfServiceContent.includes("import PDFDocument from 'pdfkit';")) {
  pdfServiceContent = "import PDFDocument from 'pdfkit';\n" + pdfServiceContent;
  
  const pdfMethod = `
  static generateDossierPdf(reports, constructionsMap, supplier) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(20).text('OOH SDIP - Client Dossier', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(\`Supplier: \${supplier?.name || 'All'}\`);
      doc.text(\`Total Reports: \${reports.length}\`);
      doc.text(\`Date: \${new Date().toLocaleString('ru-RU')}\`);
      doc.moveDown(2);

      reports.forEach((r, idx) => {
        if (idx > 0) doc.addPage();
        const c = constructionsMap.get(r.construction_id) || {};
        doc.fontSize(16).text(\`Code: \${c.code || r.construction_code || 'N/A'} (\${c.side || 'A'})\`);
        doc.fontSize(12).text(\`Address: \${c.address_location || 'N/A'}\`);
        doc.text(\`Status: \${r.status || 'PENDING'}\`);
        doc.text(\`GPS: \${r.gps_lat || 'N/A'}, \${r.gps_lon || 'N/A'}\`);
        doc.text(\`Time: \${r.captured_at}\`);
        doc.moveDown();
        doc.fontSize(10).text(\`SHA256 Stamp Hash: \${r.stamp_hash || 'N/A'}\`);
        doc.moveDown();
        doc.text(\`Photo Link: \${r.photo_url || r.raw_photo_url || 'N/A'}\`, { link: r.photo_url || '', underline: true, color: 'blue' });
      });

      doc.end();
    });
  }
}
`;
  pdfServiceContent = pdfServiceContent.replace(/}\s*$/, pdfMethod);
  fs.writeFileSync(pdfServicePath, pdfServiceContent, 'utf8');
}

// 2. Update reportController.js
const reportCtrlPath = path.join(__dirname, 'src', 'controllers', 'reportController.js');
let reportCtrlContent = fs.readFileSync(reportCtrlPath, 'utf8');

if (!reportCtrlContent.includes("exportPdfDossier(req, res)")) {
  reportCtrlContent = reportCtrlContent.replace(
    /import \{ databaseRepository \} from '\.\.\/repositories\/databaseRepository\.js';/,
    "import { databaseRepository } from '../repositories/databaseRepository.js';\nimport { PdfReportService } from '../services/pdfReportService.js';"
  );
  
  const pdfCtrlMethod = `
  static async exportPdfDossier(req, res) {
    try {
      const db = databaseRepository._readDb();
      const supplierId = req.query.supplierId;
      let reports = db.reports || [];
      if (supplierId) reports = reports.filter(r => r.supplier_id === supplierId);
      
      const constructionsMap = new Map((db.constructions || []).map(c => [c.id, c]));
      const supplier = (db.suppliers || []).find(s => s.id === supplierId) || { name: 'Все поставщики' };

      const pdfBuffer = await PdfReportService.generateDossierPdf(reports, constructionsMap, supplier);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="ooh_reports_dossier.pdf"');
      res.status(200).send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
`;
  
  reportCtrlContent = reportCtrlContent.replace(
    /static exportCSV\(req, res\)/,
    pdfCtrlMethod.trim() + "\n\n  static exportCSV(req, res)"
  );
  fs.writeFileSync(reportCtrlPath, reportCtrlContent, 'utf8');
}

// 3. Update server.js
const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

if (!serverContent.includes("/api/export/pdf")) {
  serverContent = serverContent.replace(
    /app\.get\('\/api\/export\/csv', ReportController\.exportCSV\);/,
    "app.get('/api/export/csv', ReportController.exportCSV);\napp.get('/api/export/pdf', ReportController.exportPdfDossier);"
  );
  fs.writeFileSync(serverPath, serverContent, 'utf8');
}

console.log('PDF Exports injected successfully');
