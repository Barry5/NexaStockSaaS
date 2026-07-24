import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import db from '../database/db.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const GDRIVE_FOLDER_NAME = 'NexaStock Backups';

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/admin/backups/gdrive/callback'
  );
}

export function getAuthUrl(): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2Info = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data } = await oauth2Info.userinfo.get();
  return { tokens, email: data.email };
}

export function loadStoredTokens(tenantId: string): { tokens: any; email?: string } | null {
  const row = db.prepare('SELECT tokens, email FROM gdrive_tokens WHERE tenantId = ?').get(tenantId) as any;
  if (!row) return null;
  return { tokens: JSON.parse(row.tokens), email: row.email };
}

export function saveStoredTokens(tenantId: string, data: { tokens: any; email?: string }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO gdrive_tokens (tenantId, tokens, email, connectedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tenantId) DO UPDATE SET tokens = excluded.tokens, email = excluded.email, connectedAt = excluded.connectedAt
  `).run(tenantId, JSON.stringify(data.tokens), data.email || null, now);
}

export function revokeTokens(tenantId: string) {
  db.prepare('DELETE FROM gdrive_tokens WHERE tenantId = ?').run(tenantId);
}

export function listConnectedTenants(): { tenantId: string; email: string; connectedAt: string }[] {
  return db.prepare('SELECT tenantId, email, connectedAt FROM gdrive_tokens ORDER BY connectedAt DESC').all() as any;
}

async function getAuthorizedDrive(tenantId: string) {
  const stored = loadStoredTokens(tenantId);
  if (!stored) throw new Error('Google Drive non connecté pour ce tenant.');
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials(stored.tokens);

  oauth2.on('tokens', (tokens) => {
    const updated = { ...stored, tokens: { ...stored.tokens, ...tokens } };
    saveStoredTokens(tenantId, updated);
  });

  return google.drive({ version: 'v3', auth: oauth2 });
}

async function getOrCreateFolder(drive: any): Promise<string> {
  const res = await drive.files.list({
    q: `name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files?.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: { name: GDRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.data.id;
}

export async function uploadBackupToDrive(
  archivePath: string,
  manifest: Record<string, any>,
  tenantId: string
): Promise<string> {
  const drive = await getAuthorizedDrive(tenantId);
  const folderId = await getOrCreateFolder(drive);
  const fileName = `${manifest.id}.bak`;
  const metaName = `${manifest.id}.json`;

  const fileStream = fs.createReadStream(archivePath);
  const bakRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      description: JSON.stringify(manifest),
    },
    media: { mimeType: 'application/octet-stream', body: fileStream },
    fields: 'id',
  });

  const metaStream = Readable.from(JSON.stringify(manifest));
  await drive.files.create({
    requestBody: { name: metaName, parents: [folderId] },
    media: { mimeType: 'application/json', body: metaStream },
    fields: 'id',
  });

  return bakRes.data.id!;
}

export async function listDriveBackups(tenantId: string): Promise<any[]> {
  const drive = await getAuthorizedDrive(tenantId);
  const folderId = await getOrCreateFolder(drive);

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains '.json' and trashed=false`,
    fields: 'files(id, name, size, createdTime, description)',
    orderBy: 'createdTime desc',
    spaces: 'drive',
  });

  const files = res.data.files || [];
  const manifests: any[] = [];

  for (const file of files) {
    try {
      const content = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'text' }
      );
      const manifest = JSON.parse(content.data as string);
      manifests.push({
        ...manifest,
        driveFileId: file.id,
        driveSize: file.size ? parseInt(file.size) : manifest.size,
      });
    } catch {
      // skip malformed manifests
    }
  }

  return manifests;
}

export async function downloadBackupFromDrive(
  manifestId: string,
  destDir: string,
  tenantId: string
): Promise<{ archivePath: string; manifest: any }> {
  const drive = await getAuthorizedDrive(tenantId);
  const folderId = await getOrCreateFolder(drive);

  const metaRes = await drive.files.list({
    q: `'${folderId}' in parents and name='${manifestId}.json' and trashed=false`,
    fields: 'files(id)',
  });
  if (!metaRes.data.files?.length) throw new Error('Sauvegarde introuvable sur Drive.');

  const metaFileId = metaRes.data.files[0].id!;
  const metaContent = await drive.files.get(
    { fileId: metaFileId, alt: 'media' },
    { responseType: 'text' }
  );
  const manifest = JSON.parse(metaContent.data as string);

  const bakRes = await drive.files.list({
    q: `'${folderId}' in parents and name='${manifestId}.bak' and trashed=false`,
    fields: 'files(id)',
  });
  if (!bakRes.data.files?.length) throw new Error('Fichier de sauvegarde .bak introuvable sur Drive.');

  const bakFileId = bakRes.data.files[0].id!;
  fs.mkdirSync(destDir, { recursive: true });
  const archivePath = path.join(destDir, `${manifestId}.bak`);

  const dest = fs.createWriteStream(archivePath);
  const bakStream = await drive.files.get(
    { fileId: bakFileId, alt: 'media' },
    { responseType: 'stream' }
  );
  await new Promise<void>((resolve, reject) => {
    (bakStream.data as any).pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });

  const manifestPath = path.join(destDir, `${manifestId}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { archivePath, manifest };
}
