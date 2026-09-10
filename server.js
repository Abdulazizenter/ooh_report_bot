import express from 'express';
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
const PORT = 3000;

// Body parser with 25MB limit for photo/video/zip analysis
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Workspace Adapter Middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    req.workspace = new WorkspaceAdapter(token);
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
app.post('/api/v2/sync', SpartanController.syncWithCloud);
app.get('/api/v2/user/:telegramId', SpartanController.getUserProfile);
app.get('/api/v2/specialist/nearby', SpartanController.getNearbyConstructions);
app.post('/api/v2/specialist/report', SpartanController.submitSpecialistReport);
app.get('/api/v2/kam/dashboard', SpartanController.getKamDashboard);
app.post('/api/v2/kam/upload-tz', SpartanController.uploadKamTz);

// Serve static files from root directory
app.use(express.static(__dirname));

// Fallback to index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
