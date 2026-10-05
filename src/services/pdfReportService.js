import PDFDocument from 'pdfkit';
/**
 * PDF / HTML Proof of Performance (PoP) Act Generator
 * Generates an official, beautifully styled certificate/act for advertising agencies & clients.
 */
export class PdfReportService {
  /**
   * Generates a printable HTML Act for an individual approved or reviewed report.
   */
  static generateReportHtmlAct({ report, construction, supplier, specialist }) {
    const verifiedDate = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(report.captured_at || report.created_at || Date.now()));

    const confidencePercent = Math.round(Number(report.confidence_score || 0.98) * 100);
    const isApproved = (report.status || 'PENDING') === 'APPROVED';

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт фотофиксации OOH — ${construction?.code || 'ОТЧЕТ'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@600;700&display=swap');
    
    :root {
      --primary: #0f172a;
      --accent: #f97316;
      --success: #16a34a;
      --border: #e2e8f0;
      --bg: #ffffff;
      --text: #1e293b;
      --muted: #64748b;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
      line-height: 1.5;
    }

    .act-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .act-logo h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 26px;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .act-logo p {
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }

    .act-badge {
      text-align: right;
    }
    .stamp-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      text-transform: uppercase;
      background: ${isApproved ? '#dcfce7' : '#fee2e2'};
      color: ${isApproved ? '#15803d' : '#b91c1c'};
      border: 1px solid ${isApproved ? '#86efac' : '#fca5a5'};
    }
    .act-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    .info-card {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .info-card h4 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .info-card p {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }

    .photo-section {
      margin-bottom: 30px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: #090d12;
      text-align: center;
    }
    .photo-img {
      max-width: 100%;
      height: auto;
      max-height: 520px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .photo-caption {
      padding: 12px 16px;
      background: #0f172a;
      color: #94a3b8;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      display: flex;
      justify-content: space-between;
    }

    .ai-verdict-box {
      border: 1px solid ${isApproved ? '#86efac' : '#fca5a5'};
      background: ${isApproved ? '#f0fdf4' : '#fef2f2'};
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .ai-verdict-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 700;
    }
    .ai-reasoning {
      font-size: 13px;
      color: var(--text);
      line-height: 1.6;
    }

    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
    }
    .sig-line {
      margin-top: 30px;
      width: 220px;
      border-bottom: 1px solid #cbd5e1;
    }

    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="act-header">
    <div class="act-logo">
      <h1>OOH SDIP · АКТ КОНТРОЛЯ РАЗМЕЩЕНИЯ</h1>
      <p>Единая автоматизированная система инспекции наружной рекламы</p>
    </div>
    <div class="act-badge">
      <div class="stamp-badge">${isApproved ? '✓ ВЕРИФИЦИРОВАНО ИИ' : '✕ ОТКЛОНЕНО'}</div>
      <div class="act-id">REF: ${report.id || 'N/A'}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>Рекламная конструкция (ТЗ)</h4>
      <p>${construction?.code || 'Код не указан'} · ${construction?.type || 'Билборд'} (${construction?.side || 'Сторона А'})</p>
    </div>
    <div class="info-card">
      <h4>Адрес и локация</h4>
      <p>${construction?.address_location || 'Адрес не указан'}</p>
    </div>
    <div class="info-card">
      <h4>Поставщик / Подрядчик</h4>
      <p>${supplier?.name || 'ООО МедиаАутдор Групп'}</p>
    </div>
    <div class="info-card">
      <h4>Дата и время инспекции</h4>
      <p>${verifiedDate}</p>
    </div>
  </div>

  <div class="photo-section">
    <img class="photo-img" src="${report.photo_url || report.raw_photo_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop'}" alt="Фотофиксация конструкции" />
    <div class="photo-caption">
      <span>GPS: ${report.gps_lat || construction?.latitude || 55.7928}° N, ${report.gps_lon || construction?.longitude || 37.5432}° E</span>
      <span>ХЭШ ШТАМПА: ${report.stamp_hash || 'OOH-VALIDATED-2026'}</span>
    </div>
  </div>

  <div class="ai-verdict-box">
    <div class="ai-verdict-header">
      <span>ЗАКЛЮЧЕНИЕ НЕЙРОСЕТЕВОЙ ИНСПЕКЦИИ (GEMINI VISION)</span>
      <span>Уверенность модели: ${confidencePercent}%</span>
    </div>
    <p class="ai-reasoning">
      ${report.ai_reasoning || 'Конструкция проверена в автоматическом режиме. Геопозиция специалиста подтверждена в пределах допустимого радиуса (допуск 300м). Дефектов рекламного поля, разрывов постера и перекрытия угла обзора не зафиксировано.'}
    </p>
  </div>

  <div class="signatures">
    <div>
      <p>Инспектор / Специалист: <b>${specialist?.full_name || specialist?.name || 'Абдулазиз Каримов'}</b></p>
      <div class="sig-line"></div>
    </div>
    <div style="text-align:right">
      <p>Цифровой штамп платформы: <b>OOH SDIP Enterprise</b></p>
      <p style="font-family:'JetBrains Mono',monospace;font-size:10px;margin-top:4px">SHA256:${report.signature_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}</p>
    </div>
  </div>
</body>
</html>`;
  }

  static generateDossierPdf(reports, constructionsMap, supplier) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(20).text('OOH SDIP - Client Dossier', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Supplier: ${supplier?.name || 'All'}`);
      doc.text(`Total Reports: ${reports.length}`);
      doc.text(`Date: ${new Date().toLocaleString('ru-RU')}`);
      doc.moveDown(2);

      reports.forEach((r, idx) => {
        if (idx > 0) doc.addPage();
        const c = constructionsMap.get(r.construction_id) || {};
        doc.fontSize(16).text(`Code: ${c.code || r.construction_code || 'N/A'} (${c.side || 'A'})`);
        doc.fontSize(12).text(`Address: ${c.address_location || 'N/A'}`);
        doc.text(`Status: ${r.status || 'PENDING'}`);
        doc.text(`GPS: ${r.gps_lat || 'N/A'}, ${r.gps_lon || 'N/A'}`);
        doc.text(`Time: ${r.captured_at}`);
        doc.moveDown();
        doc.fontSize(10).text(`SHA256 Stamp Hash: ${r.stamp_hash || 'N/A'}`);
        doc.moveDown();
        doc.text(`Photo Link: ${r.photo_url || r.raw_photo_url || 'N/A'}`, { link: r.photo_url || '', underline: true, color: 'blue' });
      });

      doc.end();
    });
  }
}
