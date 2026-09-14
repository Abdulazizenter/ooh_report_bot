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
import { databaseRepository } from './src/repositories/databaseRepository.js';
import multer from 'multer';

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
const SESSION_SECRET = process.env.BETTER_AUTH_SECRET;
const SESSION_COOKIE = 'ooh_session';

if (process.env.NODE_ENV === 'production' && !SESSION_SECRET) {
  throw new Error('BETTER_AUTH_SECRET must be configured in production');
}

const signSession = (userId) => {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET || 'local-development-secret').update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const readSession = (req) => {
  const token = req.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token || !SESSION_SECRET) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
};

const apiAuth = (req, res, next) => {
  if (req.path === '/v2/user/auth' || req.path === '/health') return next();
  req.auth = readSession(req);
  if (!req.auth) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Требуется вход в систему' } });
  next();
};

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

app.use('/api', apiAuth);

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

// Stored media is private; access must go through an authenticated controller.
app.use('/storage', apiAuth, (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Файл не найден' } });
});

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
app.post('/api/v2/user/auth', async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success && body.user?.is_active !== false && body.user?.id) {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${signSession(body.user.id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`);
    }
    return originalJson(body);
  };
  try {
    await SpartanController.authenticateUser(req, res);
  } catch (error) {
    next(error);
  }
});
app.post('/api/v2/user/claim-admin', SpartanController.claimAdmin);
app.post('/api/v2/sync', SpartanController.syncWithCloud);
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(file.originalname)) });
app.post('/api/v2/admin/database/ensure', SpartanController.ensureDatabase);
app.post('/api/v2/admin/import/preview', excelUpload.single('file'), SpartanController.previewImport);
app.post('/api/v2/admin/import/commit', SpartanController.commitImport);
app.get('/api/v2/admin/import-runs', (req, res) => res.json({ success: true, data: databaseRepository.getImportRuns() }));
app.get('/api/v2/suppliers/:supplierId/report', SpartanController.getSupplierReport);
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

// Start the server (only if not running in Vercel serverless environment).
// Keep a handle so the preview runner can stop this process cleanly before
// starting a replacement; otherwise the old listener can keep port 3000 busy.
let httpServer;

if (!process.env.VERCEL) {
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is already in use; the existing preview server will continue serving the app.`);
      process.exit(0);
    }
    console.error('Server listener error:', error);
    process.exitCode = 1;
  });

  const shutdown = (signal) => {
    if (!httpServer || !httpServer.listening) {
      process.exit(0);
    }

    console.log(`Received ${signal}; closing the HTTP server.`);
    httpServer.close(() => process.exit(0));
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

// Export for Vercel serverless
export default app;
