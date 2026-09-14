export function isValidPeriod(period) {
  return typeof period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

export function isValidCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function normalizeCoordinates(latitude, longitude) {
  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

export function normalizeCaptureTimestamp(value) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function isAllowedCaptureSource(source) {
  return ['live_camera_stream', 'camera_sensor', 'realtime_sensor'].includes(source);
}

export function decodeMediaDataUri(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return { mediaType: match[1].toLowerCase().replace('jpg', 'jpeg'), base64: match[2].replace(/\s/g, '') };
}

export function stableConstructionKey({ supplierId, code, side, monthPeriod }) {
  return [supplierId, code, side, monthPeriod].map(value => String(value || '').trim().toUpperCase()).join('|');
}
