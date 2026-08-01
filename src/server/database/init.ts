import db from './db.js';
import { up } from './migrations/001_initial.js';
import { up as up002 } from './migrations/002_invoicing.js';
import { up as up003 } from './migrations/003_commissions.js';
import { up as up004 } from './migrations/004_rbac.js';
import { up as up005 } from './migrations/005_multi_tenant_rbac.js';
import { up as up006 } from './migrations/006_commissions_v2.js';
import { up as up007 } from './migrations/007_delivery_notes.js';
import { up as up008 } from './migrations/008_fix_sales_fk.js';
import { up as up009 } from './migrations/009_gdrive_tokens.js';
import { up as up010 } from './migrations/010_sync_upgrade.js';
import { up as up011 } from './migrations/011_sync_tables.js';
import { up as up012 } from './migrations/012_sync_uuid_map.js';
import { seed } from './seeds.js';
import { importSnapshot } from './snapshot.js';

export function initializeDatabase() {
  console.log('Starting SQLite database initialization sequence...');
  try {
    up(db);
    up002(db);
    up003(db);
    up004(db);
    up005(db);
    up006(db);
    up007(db);
    up008(db);
    up009(db);
    up010(db);
    up011(db);
    up012(db);
    console.log('Tables created or already present.');

    seed(db);
    importSnapshot();
    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Critical database initialization failure:', error);
    throw error;
  }
}
