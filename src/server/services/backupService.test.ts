import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createBackupArchive, getBackupList, restoreBackupArchive } from './backupService';

describe('backupService', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates and restores encrypted backup archives', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-'));
    tempDirs.push(dir);

    const snapshotPath = path.join(dir, 'snapshot.db');
    fs.writeFileSync(snapshotPath, Buffer.from('database-content'));

    const backup = createBackupArchive(snapshotPath, {
      label: 'Nightly',
      strategy: 'full',
      destination: 'local',
      tenantId: 'tenant-1',
      backupDir: dir,
    });

    expect(backup.manifest.encrypted).toBe(true);
    expect(backup.manifest.strategy).toBe('full');

    const restoredPath = path.join(dir, 'restored.db');
    const restored = restoreBackupArchive(backup.manifestPath, restoredPath, { backupDir: dir });

    expect(restored.success).toBe(true);
    expect(fs.readFileSync(restoredPath).toString()).toBe('database-content');

    const backups = getBackupList(dir);
    expect(backups[0].id).toBe(backup.manifest.id);
  });
});
