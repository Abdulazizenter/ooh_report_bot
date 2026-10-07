import ExcelJS from 'exceljs';
import crypto from 'crypto';

const aliases = {
  code: ['code','код','код конструкции','номер конструкции','id конструкции'],
  supplier_id: ['supplier_id','supplier id','поставщик id'],
  supplier_name: ['supplier','поставщик','название поставщика','подрядчик'],
  address: ['address','адрес','адрес размещения','location'],
  city: ['city','город'], type: ['type','тип','формат'], side: ['side','сторона'],
  latitude: ['latitude','широта','lat'], longitude: ['longitude','долгота','lon'],
  month_period: ['month_period','period','период','месяц','период размещения'],
  ai_criteria: ['ai_criteria','criteria','критерии','требования','тз']
};
const clean = value => String(value ?? '').trim();
const key = value => clean(value).toLowerCase().replace(/[№()]/g, '').replace(/\s+/g, ' ');
function fieldMap(headers) { const map = {}; headers.forEach((header, index) => { const match = Object.entries(aliases).find(([, names]) => names.includes(key(header))); if (match) map[match[0]] = index; }); return map; }

function parseRows(rows, sheetName, options) {
  if (!rows.length) return [];
  const headers = rows[0].map(clean); const map = fieldMap(headers);
  return rows.slice(1).map((row, index) => {
    const get = name => map[name] === undefined ? '' : clean(row[map[name]]);
    const extra_data = {}; headers.forEach((header, i) => { if (header && !Object.keys(map).some(name => map[name] === i)) extra_data[header] = row[i] ?? ''; });
    return { code: get('code').toUpperCase(), supplier_id: get('supplier_id') || options.supplierId || '', supplier_name: get('supplier_name'), address: get('address'), city: get('city'), type: get('type'), side: get('side') || 'Сторона А', latitude: Number(get('latitude')) || null, longitude: Number(get('longitude')) || null, month_period: get('month_period') || options.period || '', ai_criteria: get('ai_criteria'), extra_data, source_sheet: sheetName, source_row: index + 2 };
  });
}

export async function normalizeWorkbook(buffer, options = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames = workbook.worksheets.map(ws => ws.name);
  
  let allRows = [];
  workbook.worksheets.forEach(ws => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed in exceljs, so we slice(1)
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values);
    });
    allRows = allRows.concat(parseRows(rows, ws.name, options));
  });

  const valid = [], errors = [], warnings = [], seen = new Set();
  allRows.forEach(row => { const issues = []; if (!row.code) issues.push('Не указан код конструкции'); if (!row.address) issues.push('Не указан адрес'); if (!row.supplier_id && !row.supplier_name) issues.push('Не указан поставщик'); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month_period)) issues.push('Некорректный период YYYY-MM'); if (row.latitude !== null && (row.latitude < -90 || row.latitude > 90)) issues.push('Некорректная широта'); if (row.longitude !== null && (row.longitude < -180 || row.longitude > 180)) issues.push('Некорректная долгота'); if (issues.length) errors.push({ row, issues }); else { const stable = `${row.supplier_id || row.supplier_name}|${row.code}|${row.side}|${row.month_period}`; if (seen.has(stable)) warnings.push({ row, issues: ['Дубликат строки в файле'] }); else { seen.add(stable); valid.push({ ...row, import_key: stable }); } } });
  
  return { checksum: crypto.createHash('sha256').update(buffer).digest('hex'), sheetNames, valid, warnings, errors, summary: { total: allRows.length, valid: valid.length, warnings: warnings.length, errors: errors.length } };
}
