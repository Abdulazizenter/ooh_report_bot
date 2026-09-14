import { google } from 'googleapis';
import stream from 'stream';

export class WorkspaceAdapter {
  constructor(accessToken) {
    // Check if we are running in production with a Service Account
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      console.log('WorkspaceAdapter: Using Service Account Authentication');
      this.auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      // Fallback to client-provided OAuth token (for AI Studio development)
      console.log('WorkspaceAdapter: Using Client-Provided OAuth Token');
      this.auth = new google.auth.OAuth2();
      this.auth.setCredentials({ access_token: accessToken });
    }
    
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  // --- DRIVE METHODS ---

  async findOrCreateFolder(name, parentId = null) {
    let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    }

    const res = await this.drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const createRes = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
      },
      fields: 'id'
    });

    return createRes.data.id;
  }

  async uploadPhotoToFolder(base64Data, filename, folderId) {
    const base64Str = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Str, 'base64');
    
    // Using a stream approach for googleapis
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const res = await this.drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId]
      },
      media: {
        mimeType: 'image/jpeg',
        body: bufferStream
      },
      fields: 'id, webViewLink, webContentLink'
    });

    // Make file accessible (anyone with link) so web UI can show it if needed
    try {
      await this.drive.permissions.create({
        fileId: res.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });
    } catch (e) {
      console.warn("Could not set public permission on Drive file:", e.message);
    }

    return res.data;
  }

  // --- SHEETS METHODS ---

  async findOrCreateDatabaseSpreadsheet() {
    const configuredId = process.env.GOOGLE_SPREADSHEET_ID;
    if (configuredId) { await this.ensureDatabaseSpreadsheet(configuredId); return configuredId; }
    const q = `name = 'OOH_PROMO_HUB_DB' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const res = await this.drive.files.list({ q, fields: 'files(id, name)' });
    const spreadsheetId = res.data.files[0]?.id || (await this.sheets.spreadsheets.create({
      requestBody: { properties: { title: 'OOH_PROMO_HUB_DB' }, sheets: ['Metadata','Users','Suppliers','Constructions','Programs','Reports','ImportRuns','AuditLog'].map(title => ({ properties: { title } })) },
      fields: 'spreadsheetId'
    })).data.spreadsheetId;
    await this.ensureDatabaseSpreadsheet(spreadsheetId);
    return spreadsheetId;
  }

  async ensureDatabaseSpreadsheet(spreadsheetId) {
    const schema = {
      Metadata: ['schema_version','spreadsheet_id','created_at','updated_at','last_sync_at','sync_status'],
      Users: ['id','telegram_id','role','name','supplier_id','organization','phone'],
      Suppliers: ['id','name','inn','contact_email','contact_phone','folder_path','created_at'],
      Constructions: ['id','supplier_id','code','city','address_location','latitude','longitude','type','side','lighting_type','tolerance_meters','ai_criteria','reference_photo_url','month_period','extra_data'],
      Programs: ['id','supplier_id','name','month_period','criteria','created_at'],
      Reports: ['id','construction_id','supplier_id','specialist_id','telegram_id','captured_at','status','verification_status','photo_url','stamp_hash','ai_criteria','detected_issues','ai_reasoning','raw_photo_url','gps_lat','gps_lon','geo_distance_meters'],
      ImportRuns: ['id','supplier_id','month_period','file_name','checksum','status','valid_rows','warning_rows','error_rows','created_at','errors'],
      AuditLog: ['id','actor_id','action','entity','entity_id','created_at','details']
    };
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
    const existing = new Set((meta.data.sheets || []).map(sheet => sheet.properties.title));
    const missing = Object.keys(schema).filter(title => !existing.has(title));
    if (missing.length) await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map(title => ({ addSheet: { properties: { title } } })) } });
    await this.sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: Object.entries(schema).map(([title, headers]) => ({ range: `${title}!A1`, values: [headers] })) } });
    return { spreadsheetId, sheets: Object.keys(schema), schemaVersion: '2' };
  }

  async readSheet(spreadsheetId, sheetName) {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z`,
      });
      const rows = res.data.values;
      if (!rows || rows.length === 0) return [];
      
      const headers = rows[0];
      return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || null;
        });
        return obj;
      });
    } catch (e) {
      console.warn(`Error reading sheet ${sheetName}:`, e.message);
      return [];
    }
  }

  async clearAndWriteSheet(spreadsheetId, sheetName, dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    
    try {
      // 1. Get headers to ensure we write them in the right order
      const headerRes = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!1:1`,
      });
      let headers = headerRes.data.values ? headerRes.data.values[0] : null;
      
      if (!headers) {
        // If sheet is completely empty, use keys of first object
        headers = Object.keys(dataArray[0]);
      }

      // 2. Prepare values array
      const values = [headers];
      dataArray.forEach(item => {
        const row = headers.map(h => {
          const val = item[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        });
        values.push(row);
      });

      // 3. Clear existing data starting from row 2
      try {
        await this.sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${sheetName}!A2:Z`,
        });
      } catch (err) {
        // Ignore clear errors if sheet was empty
      }

      // 4. Update with new values
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      
    } catch (e) {
      console.error(`Error updating sheet ${sheetName}:`, e.message);
    }
  }

  async appendRow(spreadsheetId, sheetName, rowData) {
    // We need to match the order of headers
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headers = res.data.values ? res.data.values[0] : [];
    if (headers.length === 0) return;

    const values = headers.map(h => rowData[h] !== undefined ? String(rowData[h]) : '');
    
    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values]
      }
    });
  }

  async updateRowById(spreadsheetId, sheetName, rowId, rowData) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z`,
    });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return;
    
    const headers = rows[0];
    const idIndex = headers.indexOf('id');
    if (idIndex === -1) return;

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idIndex] === rowId) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return;

    const values = headers.map((h, idx) => {
      if (rowData[h] !== undefined) return String(rowData[h]);
      return rows[rowIndex][idx] || ''; // preserve existing if not updated
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values]
      }
    });
  }
}

