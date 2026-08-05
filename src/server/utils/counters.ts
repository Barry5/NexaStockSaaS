import db from '../database/db.js';

// Numérotation comptable SÛRE (audit §2.5, S6) : compteur persistant par
// (tenantId, type, année) dans `invoice_counters` (migration 014). Immunisé
// contre les suppressions (le COUNT+1 précédent dupliquait les numéros après
// une annulation) et atomique (INSERT ... ON CONFLICT DO UPDATE counter+1).
export function nextCounter(tenantId: string, type: string, prefix: string): string {
  const year = new Date().getFullYear();
  db.prepare(`
    INSERT INTO invoice_counters (tenantId, type, year, counter)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (tenantId, type, year)
    DO UPDATE SET counter = invoice_counters.counter + 1
  `).run(tenantId, type, year);
  const row = db.prepare(`SELECT counter FROM invoice_counters WHERE tenantId = ? AND type = ? AND year = ?`)
    .get(tenantId, type, year) as { counter: number };
  return `${prefix}-${year}-${String(row.counter).padStart(4, '0')}`;
}
