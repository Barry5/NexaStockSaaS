import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export type BackupStrategy = 'full' | 'incremental' | 'differential';
export type BackupDestination = 'local' | 'remote';

export interface TenantBackupStats {
  products: number;
  customers: number;
  sales: number;
  expenses: number;
  suppliers: number;
  users: number;
  invoices: number;
}

export interface BackupManifest {
  id: string;
  label: string;
  strategy: BackupStrategy;
  destination: BackupDestination;
  tenantId: string;
  tenantName?: string;
  sourcePath: string;
  createdAt: string;
  size: number;
  checksum: string;
  encrypted: boolean;
  version: number;
  stats?: TenantBackupStats;
}

interface BackupArchiveOptions {
  label: string;
  strategy: BackupStrategy;
  destination: BackupDestination;
  tenantId: string;
  tenantName?: string;
  backupDir?: string;
  password?: string;
}

interface RestoreOptions {
  backupDir?: string;
  password?: string;
}

const DEFAULT_PASSWORD = 'nexastock-backup-key';
const BACKUP_VERSION = 1;

function ensureBackupDir(backupDir?: string) {
  const resolvedDir = backupDir || path.join(process.cwd(), 'backups');
  fs.mkdirSync(resolvedDir, { recursive: true });
  return resolvedDir;
}

function createChecksum(buffer: Buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function encryptBuffer(buffer: Buffer, password: string) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(password).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

function decryptBuffer(buffer: Buffer, password: string) {
  const iv = buffer.subarray(0, 16);
  const payload = buffer.subarray(16);
  const key = crypto.createHash('sha256').update(password).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export function createBackupArchive(sourcePath: string, options: BackupArchiveOptions) {
  const backupDir = ensureBackupDir(options.backupDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const id = `backup-${timestamp}`;
  const label = options.label || 'Manual';
  const password = options.password || DEFAULT_PASSWORD;
  const sourceBuffer = fs.readFileSync(sourcePath);
  const encryptedBuffer = encryptBuffer(sourceBuffer, password);
  const archivePath = path.join(backupDir, `${id}.bak`);
  fs.writeFileSync(archivePath, encryptedBuffer);

  const manifest: BackupManifest = {
    id,
    label,
    strategy: options.strategy || 'full',
    destination: options.destination || 'local',
    tenantId: options.tenantId,
    sourcePath: path.basename(sourcePath),
    createdAt: new Date().toISOString(),
    size: encryptedBuffer.length,
    checksum: createChecksum(sourceBuffer),
    encrypted: true,
    version: BACKUP_VERSION,
  };

  const manifestPath = path.join(backupDir, `${id}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { archivePath, manifestPath, manifest };
}

export function getBackupList(backupDir?: string) {
  const resolvedDir = ensureBackupDir(backupDir);
  const manifestFiles = fs.readdirSync(resolvedDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(resolvedDir, file))
    .sort((a, b) => b.localeCompare(a));

  return manifestFiles.map(filePath => {
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BackupManifest;
    return {
      id: manifest.id,
      label: manifest.label,
      strategy: manifest.strategy,
      destination: manifest.destination,
      tenantId: manifest.tenantId,
      createdAt: manifest.createdAt,
      size: manifest.size,
      encrypted: manifest.encrypted,
      manifestPath: filePath,
      archivePath: path.join(path.dirname(filePath), `${manifest.id}.bak`),
    };
  });
}

export function restoreBackupArchive(manifestPath: string, destinationPath: string, options: RestoreOptions = {}) {
  const backupDir = options.backupDir || path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
  const archivePath = path.join(backupDir, `${manifest.id}.bak`);
  const password = options.password || DEFAULT_PASSWORD;
  const encryptedBuffer = fs.readFileSync(archivePath);
  const restoredBuffer = decryptBuffer(encryptedBuffer, password);
  fs.writeFileSync(destinationPath, restoredBuffer);

  return {
    success: true,
    manifest,
    restoredPath: destinationPath,
  };
}
