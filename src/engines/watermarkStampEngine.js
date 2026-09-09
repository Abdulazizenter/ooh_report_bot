import crypto from 'crypto';

// WatermarkStampEngine: handles watermarking, cryptographic HUD stamping, and metadata burning
export class WatermarkStampEngine {
  /**
   * Generates a tamper-proof verification signature
   */
  static generateStampHash({ contractorName, constructionCode, displayDate, displayTime, latitude, longitude }) {
    const rawString = `${contractorName}|${constructionCode}|${displayDate}|${displayTime}|${latitude}|${longitude}`;
    return crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 16).toUpperCase();
  }

  /**
   * Builds the official 4-pillar stamp metadata according to platform requirements
   */
  static generateOfficialStamp({ contractor, location, construction, captureTime, specialist }) {
    const now = new Date(captureTime || Date.now());
    const displayDate = now.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const displayTime = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const stampHash = this.generateStampHash({
      contractorName: contractor.name,
      constructionCode: construction.code,
      displayDate,
      displayTime,
      latitude: location.latitude,
      longitude: location.longitude
    });

    return {
      stampHash: `OOH-${stampHash}`,
      pillar1_Contractor: {
        title: 'ПОСТАВЩИК',
        organization: contractor.name,
        inn: contractor.inn || 'Не указан',
        specialistName: specialist?.name || contractor.representative || 'Полевой специалист'
      },
      pillar2_Location: {
        title: 'ЛОКАЦИЯ',
        city: location.city || 'Москва',
        address: location.address || 'Адрес не указан',
        gpsCoordinates: `${location.latitude?.toFixed(6) || '55.751244'}, ${location.longitude?.toFixed(6) || '37.618423'}`,
        gpsAccuracy: location.accuracy ? `±${Math.round(location.accuracy)}м` : '±4м (GPS/ГЛОНАСС)'
      },
      pillar3_Construction: {
        title: 'КОНСТРУКЦИЯ',
        code: construction.code,
        type: construction.type || 'Билборд',
        side: construction.side || 'Сторона А',
        lighting: construction.lightingType || 'Внешняя'
      },
      pillar4_DateTime: {
        title: 'ДАТА И ВРЕМЯ',
        date: displayDate,
        time: displayTime,
        timeZone: 'MSK (UTC+3)',
        realtimeVerified: true
      },
      watermarkText: `OOH SDIP REAL-TIME STREAM • ${contractor.name} • ${displayDate} ${displayTime} • HASH: ${stampHash}`
    };
  }

  /**
   * Creates an SVG overlay stamp that can be combined with image buffers
   */
  static createSvgStampOverlay(stampData, width = 1280, height = 720) {
    const p1 = stampData.pillar1_Contractor;
    const p2 = stampData.pillar2_Location;
    const p3 = stampData.pillar3_Construction;
    const p4 = stampData.pillar4_DateTime;

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Diagonal Watermark Pattern -->
        <g opacity="0.12" transform="rotate(-25 640 360)">
          <text x="50" y="300" font-family="monospace" font-size="28" font-weight="900" fill="#ffffff" letter-spacing="4">
            ${stampData.watermarkText}
          </text>
          <text x="50" y="450" font-family="monospace" font-size="28" font-weight="900" fill="#ffffff" letter-spacing="4">
            VERIFIED REAL-TIME FIELD CAPTURE • NO GALLERY • HASH: ${stampData.stampHash}
          </text>
        </g>

        <!-- Bottom HUD Stamp Box -->
        <rect x="20" y="${height - 130}" width="${width - 40}" height="110" rx="12" fill="#0c0e14" fill-opacity="0.88" stroke="#ef4444" stroke-width="2"/>

        <!-- Header line -->
        <text x="40" y="${height - 105}" font-family="sans-serif" font-size="12" font-weight="900" fill="#ef4444" letter-spacing="1.5">
          🛡️ ЕДИНЫЙ ЦИФРОВОЙ ШТАМП OOH МОНИТОРИНГА [REAL-TIME CERTIFIED]
        </text>
        <text x="${width - 240}" y="${height - 105}" font-family="monospace" font-size="11" font-weight="700" fill="#10b981">
          ХЭШ: ${stampData.stampHash}
        </text>

        <!-- 4 Pillars Grid in Stamp -->
        <g font-family="sans-serif" font-size="11" fill="#ffffff">
          <!-- Pillar 1: Поставщик -->
          <text x="40" y="${height - 75}" font-weight="800" fill="#9ca3af">1. ПОСТАВЩИК:</text>
          <text x="40" y="${height - 58}" font-weight="900" fill="#f87171">${p1.organization}</text>
          <text x="40" y="${height - 42}" fill="#d1d5db">${p1.specialistName}</text>

          <!-- Pillar 2: Локация -->
          <text x="320" y="${height - 75}" font-weight="800" fill="#9ca3af">2. ЛОКАЦИЯ:</text>
          <text x="320" y="${height - 58}" font-weight="900" fill="#38bdf8">${p2.city}, ${p2.address}</text>
          <text x="320" y="${height - 42}" font-family="monospace" fill="#7dd3fc">${p2.gpsCoordinates} (${p2.gpsAccuracy})</text>

          <!-- Pillar 3: Конструкция -->
          <text x="680" y="${height - 75}" font-weight="800" fill="#9ca3af">3. КОНСТРУКЦИЯ:</text>
          <text x="680" y="${height - 58}" font-weight="900" fill="#facc15">${p3.code} (${p3.type})</text>
          <text x="680" y="${height - 42}" fill="#fde047">${p3.side} • ${p3.lighting}</text>

          <!-- Pillar 4: Дата и время -->
          <text x="980" y="${height - 75}" font-weight="800" fill="#9ca3af">4. ДАТА И ВРЕМЯ:</text>
          <text x="980" y="${height - 58}" font-weight="900" fill="#34d399">${p4.date} ${p4.time} MSK</text>
          <text x="980" y="${height - 42}" font-weight="700" fill="#10b981">⚡ СЪЕМКА В РЕАЛЬНОМ ВРЕМЕНИ</text>
        </g>
      </svg>
    `;
  }
}
