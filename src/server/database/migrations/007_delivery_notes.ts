import { Database } from 'better-sqlite3';

export function up(db: Database) {
  // Add new columns to existing delivery_orders
  const cols = [
    'driverName',
    'vehicleInfo',
    'warehouseOrigin',
    'deliveryAddress',
    'deliveryPhone',
    'deliveryDate',
    'deliveryTime',
    'customerSignature',
    'driverSignature',
    'companyStamp',
    'updatedAt',
    'updatedBy',
    'updatedByName',
  ];
  for (const col of cols) {
    try {
      db.exec(`ALTER TABLE delivery_orders ADD COLUMN ${col} TEXT`);
    } catch (_) {}
  }

  // Delivery note audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_note_audit (
      id TEXT PRIMARY KEY,
      deliveryNoteId TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      userId TEXT,
      userName TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (deliveryNoteId) REFERENCES delivery_orders(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dna_delivery ON delivery_note_audit(deliveryNoteId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dna_tenant ON delivery_note_audit(tenantId)`);

  // Add delivery_note_audit to sync_tracking if not exists
  try {
    db.exec(`ALTER TABLE sync_tracking ADD COLUMN delivery_note_audit_last_sync TEXT`);
  } catch (_) {}
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS delivery_note_audit`);
}
