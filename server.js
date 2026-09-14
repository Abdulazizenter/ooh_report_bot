import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReportController } from './src/controllers/reportController.js';
import { KamProgramController } from './src/controllers/kamProgramController.js';
import { FieldReportController } from './src/controllers/fieldReportController.js';
import { ArchiveController } from './src/controllers/archiveController.js';
import { SpartanController } from './src/controllers/spartanController.js';
import { WorkspaceAdapter } from './src/repositories/workspaceAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const requestWindow = new Map();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const REQUEST_BODY_LIMIT = '25mb';

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [key, entry] of requestWindow) {
    if (entry.startedAt < cutoff) requestWindow.delete(key);
  }
}, RATE_WINDOW_MS).unref();

const createRequestId = () => crypto.randomUUID();

app.disable('x-powered-by');
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = req.get('x-request-id') || createRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = requestWindow.get(key);
  if (!entry || now - entry.startedAt > RATE_WINDOW_MS) {
    requestWindow.set(key, { startedAt: now, count: 1 });
  } else {
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Повторите позже.' } });
    }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.on('finish', () => console.log(JSON.stringify({ type: 'request', method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt })));
  next();
});

// Body parser with 25MB limit for photo/video/zip analysis
app.use(express.json({ limit: REQUEST_BODY_LIMIT, strict: true }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'ooh-promo-hub', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  res.standard = (status, data, error = null) => res.status(status).json({ success: !error, data: error ? undefined : data, error: error || undefined, meta: { timestamp: new Date().toISOString() } });
  next();
});

// Workspace Adapter Middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    req.workspace = new WorkspaceAdapter(token);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // If running in production with Service Account, token is not needed from client
    req.workspace = new WorkspaceAdapter(null);
  }
  next();
});

// Static storage folder for structured supplier archives (/{Supplier}/{YYYY-MM}/)
app.use('/storage', express.static(path.join(__dirname, 'storage')));

// REST API Endpoints for OOH Reports and Users
app.get('/api/reports', ReportController.getReports);
app.get('/api/reports/:id', ReportController.getReportById);
app.post('/api/reports', ReportController.createReport);
app.put('/api/reports/:id', ReportController.updateReport);
app.post('/api/reports/:id/verify', ReportController.verifyReport);
app.delete('/api/reports/:id', ReportController.deleteReport);

app.get('/api/users', ReportController.getUsers);
app.get('/api/users/:id', ReportController.getUser);
app.put('/api/users/:id', ReportController.updateUser);

app.get('/api/contractors', ReportController.getContractors);
app.get('/api/constructions', ReportController.getConstructions);
app.get('/api/stats', ReportController.getStats);
app.get('/api/export/csv', ReportController.exportCSV);

// New KAM Program & Criteria Endpoints
app.get('/api/kam/programs', KamProgramController.getPrograms);
app.post('/api/kam/programs', KamProgramController.saveProgram);

// New Real-Time Field Specialist Submission with automated Engine analysis
app.post('/api/field/reports', FieldReportController.submitRealTimeReport);

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// Monthly Archive Folders Explorer
app.get('/api/archive/folders', ArchiveController.getFolders);

// --- SPARTAN RELATIONAL WORKFLOW API (Telegram Web App) ---
app.post('/api/v2/user/auth', SpartanController.authenticateUser);
app.post('/api/v2/user/claim-admin', SpartanController.claimAdmin);
app.post('/api/v2/sync', SpartanController.syncWithCloud);
app.post('/api/v2/admin/clear-db', SpartanController.adminClearDatabase);
app.post('/api/v2/admin/import-constructions', SpartanController.adminImportConstructions);
app.get('/api/v2/user/:telegramId', SpartanController.getUserProfile);
app.get('/api/v2/specialist/nearby', SpartanController.getNearbyConstructions);
app.post('/api/v2/specialist/report', SpartanController.submitSpecialistReport);
app.get('/api/v2/kam/dashboard', SpartanController.getKamDashboard);
app.post('/api/v2/kam/upload-tz', SpartanController.uploadKamTz);

// Keep API failures machine-readable and prevent internal details leaking to clients.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.type === 'entity.too.large' ? 413 : 400;
  const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST';
  console.error(JSON.stringify({ type: 'request_error', requestId: req.requestId, code, message: err.message }));
  res.status(status).json({ success: false, error: { code, message: status === 413 ? 'Размер запроса превышает допустимый лимит.' : 'Некорректный формат запроса.' }, meta: { requestId: req.requestId, timestamp: new Date().toISOString() } });
});

// Return a consistent JSON response for unknown API routes instead of serving the SPA shell.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: { code: 'API_ROUTE_NOT_FOUND', message: 'API route not found' }, meta: { requestId: req.requestId } });
});

// Serve static files from root directory
app.use(express.static(__dirname));

// Fallback to index.html for all browser routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server (only if not running in Vercel serverless environment)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

// Export for Vercel serverless
export default app;
