/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Database (SQLite + WAL + Seeds)
import { initializeDatabase } from './src/server/database/init.js';
initializeDatabase();

// Import Router Modules
import authRouter from './src/server/routes/auth.js';
import productsRouter from './src/server/routes/products.js';
import salesRouter from './src/server/routes/sales.js';
import customersRouter from './src/server/routes/customers.js';
import suppliersRouter from './src/server/routes/suppliers.js';
import expensesRouter from './src/server/routes/expenses.js';
import loansRouter from './src/server/routes/loans.js';
import warehousesRouter from './src/server/routes/warehouses.js';
import usersRouter from './src/server/routes/users.js';
import dashboardRouter from './src/server/routes/dashboard.js';
import aiRouter from './src/server/routes/ai.js';
import tenantsRouter from './src/server/routes/tenants.js';
import invoicesRouter from './src/server/routes/invoices.js';
import commissionsRouter from './src/server/routes/commissions.js';
import commissionsV2Router from './src/server/routes/commissions_v2.js';
import deliveryNotesRouter from './src/server/routes/delivery_notes.js';
import rbacRouter from './src/server/routes/rbac.js';
import modulesRouter from './src/server/routes/modules.js';
import syncRouter, { compileCompleteState } from './src/server/routes/sync.js';

// Middlewares
import { errorHandler } from './src/server/middleware/errorHandler.js';
import { createBackup, getBackupList, dbPath, BACKUP_DIR } from './src/server/database/db.js';
import { requireRole } from './src/server/middleware/auth.js';
import { authenticateToken as authenticate } from './src/server/middleware/auth.js';
import { createBackupArchive, getBackupList as getBackupArchiveList, restoreBackupArchive } from './src/server/services/backupService.js';
import {
  getAuthUrl, exchangeCodeForTokens, loadStoredTokens, revokeTokens,
  uploadBackupToDrive, listDriveBackups, downloadBackupFromDrive
} from './src/server/services/googleDriveService.js';
import { requireActiveTenant, requireModuleAccess } from './src/server/middleware/tenantAccess.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security & PWA headers for all responses
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Configure body-parser limits for base64 file attachments
app.use(express.json({ limit: '50mb' }));

// PWA routes — serve from dist with correct MIME types (works in both dev & prod)
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(process.cwd(), 'dist', 'sw.js'));
});

app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(process.cwd(), 'dist', 'manifest.webmanifest'));
});

app.get('/offline.html', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(process.cwd(), 'dist', 'offline.html'));
});

// 1. Core API Routers
app.use('/api/auth', authRouter);

// Business routes with multi-tenant verification chain (auth + active tenant + module access)
const moduleGuard = (moduleKey: string) => [authenticate, requireActiveTenant, requireModuleAccess(moduleKey)];
app.use('/api/products', ...moduleGuard('products'), productsRouter);
app.use('/api/sales', ...moduleGuard('sales'), salesRouter);
app.use('/api/customers', ...moduleGuard('customers'), customersRouter);
app.use('/api/suppliers', ...moduleGuard('suppliers'), suppliersRouter);
app.use('/api/expenses', ...moduleGuard('expenses'), expensesRouter);
app.use('/api/loans', ...moduleGuard('loans'), loansRouter);
app.use('/api/warehouses', ...moduleGuard('warehouses'), warehousesRouter);
app.use('/api/users', [authenticate, requireActiveTenant], usersRouter);
app.use('/api/dashboard', ...moduleGuard('dashboard'), dashboardRouter);
app.use('/api/ai', ...moduleGuard('ai'), aiRouter);
app.use('/api/saas', tenantsRouter);
app.use('/api/invoices', ...moduleGuard('invoices'), invoicesRouter);
app.use('/api/commissions', ...moduleGuard('commissions'), commissionsRouter);
app.use('/api/commissions/v2', ...moduleGuard('commissions'), commissionsV2Router);
app.use('/api/delivery-notes', ...moduleGuard('invoices'), deliveryNotesRouter);

// RBAC Routes
app.use('/api/rbac', rbacRouter);

// Multi-tenant Module Routes
app.use('/api/modules', modulesRouter);

// Sync and Compatibility routes (supporting existing front-end calls)
app.use('/api/sync', syncRouter);
app.post('/api/db/sync', syncRouter);

// GET /api/db for direct sync compilation
app.get('/api/db', (req, res, next) => {
  try {
    const state = compileCompleteState();
    res.json(state);
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Backup endpoints (superadmin only)
app.post('/api/admin/backup', authenticate, requireRole(['superadmin']), (req, res, next) => {
  try {
    const backupPath = createBackup();
    res.json({ success: true, path: backupPath, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/backups/enterprise', authenticate, requireRole(['superadmin', 'owner', 'admin']), (req, res, next) => {
  try {
    const { label = 'Sauvegarde manuelle', strategy = 'full', destination = 'local', tenantId } = req.body || {};
    const backup = createBackupArchive(dbPath, {
      label,
      strategy,
      destination,
      tenantId,
    });
    res.json({ success: true, backup });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/backups', authenticate, requireRole(['superadmin']), (req, res, next) => {
  try {
    const backups = getBackupList();
    res.json({ success: true, backups });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/backups/enterprise', authenticate, requireRole(['superadmin', 'owner', 'admin']), (req, res, next) => {
  try {
    const backups = getBackupArchiveList();
    res.json({ success: true, backups });
  } catch (error) {
    next(error);
  }
});

// Helper to resolve tenantId from request: body/query for superadmin, JWT for regular users
function resolveTenantId(req: any): string {
  const explicit = req.body?.tenantId || req.query?.tenantId;
  if (explicit && req.user?.role === 'superadmin') return explicit;
  return req.user?.tenantId || '__superadmin__';
}

// Google Drive OAuth routes
app.get('/api/admin/backups/gdrive/auth-url', authenticate, requireRole(['superadmin', 'owner', 'admin']), (req, res) => {
  const state = encodeURIComponent(JSON.stringify({ tenantId: resolveTenantId(req) }));
  const url = getAuthUrl() + `&state=${state}`;
  res.json({ url });
});

app.get('/api/admin/backups/gdrive/callback', async (req, res, next) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    if (!code) return res.status(400).json({ error: 'Code OAuth manquant.' });
    let tenantId = '__superadmin__';
    if (state) {
      try { tenantId = JSON.parse(decodeURIComponent(state)).tenantId; } catch {}
    }
    const { tokens, email } = await exchangeCodeForTokens(code);
    saveStoredTokens(tenantId, { tokens, email: email || '' });
    res.send(`<script>window.opener?.postMessage({type:'GDRIVE_AUTH_SUCCESS',email:${JSON.stringify(email)},tenantId:${JSON.stringify(tenantId)}}, '*');window.close();</script>`);
  } catch (error) { next(error); }
});

app.get('/api/admin/backups/gdrive/status', authenticate, requireRole(['superadmin', 'owner', 'admin']), (req, res) => {
  const tenantId = resolveTenantId(req);
  const stored = loadStoredTokens(tenantId);
  res.json({ connected: !!stored, email: stored?.email || null, tenantId });
});

app.delete('/api/admin/backups/gdrive/revoke', authenticate, requireRole(['superadmin', 'owner', 'admin']), (req, res) => {
  const tenantId = resolveTenantId(req);
  revokeTokens(tenantId);
  res.json({ success: true, tenantId });
});

app.get('/api/admin/backups/gdrive/list', authenticate, requireRole(['superadmin', 'owner', 'admin']), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const backups = await listDriveBackups(tenantId);
    res.json({ success: true, backups, tenantId });
  } catch (error) { next(error); }
});

app.post('/api/admin/backups/gdrive/upload', authenticate, requireRole(['superadmin', 'owner', 'admin']), async (req, res, next) => {
  try {
    const { label = 'Sauvegarde Drive', strategy = 'full' } = req.body || {};
    const tenantId = resolveTenantId(req);
    const { manifest, archivePath } = createBackupArchive(dbPath, { label, strategy, destination: 'remote', tenantId });
    const driveFileId = await uploadBackupToDrive(archivePath, manifest, tenantId);
    res.json({ success: true, manifest, driveFileId, tenantId });
  } catch (error) { next(error); }
});

app.post('/api/admin/backups/gdrive/restore', authenticate, requireRole(['superadmin', 'owner', 'admin']), async (req, res, next) => {
  try {
    const { manifestId } = req.body || {};
    if (!manifestId) return res.status(400).json({ error: 'manifestId requis.' });
    const tenantId = resolveTenantId(req);
    const backupDir = BACKUP_DIR;
    const { archivePath, manifest: dlManifest } = await downloadBackupFromDrive(manifestId, backupDir, tenantId);
    const manifestPath = path.join(backupDir, `${manifestId}.json`);
    const destPath = dbPath;
    const result = restoreBackupArchive(manifestPath, destPath);
    res.json({ success: true, result, tenantId });
  } catch (error) { next(error); }
});

// Super admin: list all tenants with their Drive connection status
app.get('/api/admin/backups/gdrive/tenants', authenticate, requireRole(['superadmin']), (_req, res) => {
  const connected = listConnectedTenants();
  res.json({ tenants: connected });
});

app.post('/api/admin/backups/restore', authenticate, requireRole(['superadmin']), (req, res, next) => {
  try {
    const { manifestPath, destinationPath = path.join(process.cwd(), 'database.restored.db') } = req.body || {};
    const result = restoreBackupArchive(manifestPath, destinationPath);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
});

// 2. Global Error Handler Middleware
app.use(errorHandler);

// 3. Dev Server Middleware & Static Asset Delivery
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted in development mode');
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Static assets with aggressive caching (fingerprinted by Vite)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Icons with long cache
    app.use('/icons', express.static(path.join(distPath, 'icons'), {
      maxAge: '1y',
      immutable: true,
    }));

    // All other static files
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));

    // SPA fallback — serve index.html for all non-API, non-file routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production static build assets');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SaaS Server running on http://localhost:${PORT}`);
  });
}

startServer();
