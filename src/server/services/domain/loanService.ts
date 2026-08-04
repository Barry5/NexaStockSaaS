import { BaseService } from './baseService.js';
import db from '../../database/db.js';

const LOAN_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'type', pg: 'type' },
  { sqlite: 'partnerName', pg: 'partner_name' },
  { sqlite: 'amount', pg: 'amount' },
  { sqlite: 'date', pg: 'date' },
  { sqlite: 'description', pg: 'description' },
  { sqlite: 'remainingBalance', pg: 'remaining_balance' },
  { sqlite: 'status', pg: 'status' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
];

export class LoanService extends BaseService {
  constructor() {
    super('loans', 'loans', LOAN_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    const loans = db.prepare('SELECT * FROM loans WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];
    return loans.map(loan => ({
      ...loan,
      repayments: db.prepare('SELECT * FROM repayments WHERE loanId = ? ORDER BY date DESC').all(loan.id),
      installments: db.prepare('SELECT * FROM loan_installments WHERE loanId = ? ORDER BY dueDate ASC').all(loan.id),
    }));
  }

  getById(id: string): any | undefined {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as any | undefined;
    if (!loan) return undefined;
    loan.repayments = db.prepare('SELECT * FROM repayments WHERE loanId = ? ORDER BY date DESC').all(loan.id);
    loan.installments = db.prepare('SELECT * FROM loan_installments WHERE loanId = ? ORDER BY dueDate ASC').all(loan.id);
    return loan;
  }

  create(data: any, tenantId: string): any {
    const loanId = data.id || `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO loans (id, type, partnerName, amount, date, description, remainingBalance, status, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        loanId,
        data.type,
        data.partnerName,
        data.amount,
        data.date,
        data.description || null,
        data.remainingBalance,
        data.status || 'actif',
        tenantId
      );

      if (data.repayments && Array.isArray(data.repayments)) {
        for (const rep of data.repayments) {
          db.prepare(`
            INSERT INTO repayments (id, loanId, amount, date, note)
            VALUES (?, ?, ?, ?, ?)
          `).run(rep.id, loanId, rep.amount, rep.date, rep.note || null);
        }
      }

      if (data.installments && Array.isArray(data.installments)) {
        for (const inst of data.installments) {
          db.prepare(`
            INSERT INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(inst.id, loanId, inst.dueDate, inst.amount, inst.status || 'en_attente', inst.paidDate || null, inst.note || null);
        }
      }
    });

    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as any;
    this.enqueueSync('CREATE', loanId, { ...loan, legacy_id: loanId }, tenantId);

    return this.getById(loanId);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM loans WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return null;

    this.runInTransaction(() => {
      db.prepare(`
        UPDATE loans SET type = ?, partnerName = ?, amount = ?, date = ?, description = ?, remainingBalance = ?, status = ?
        WHERE id = ? AND tenantId = ?
      `).run(
        data.type,
        data.partnerName,
        data.amount,
        data.date,
        data.description || null,
        data.remainingBalance,
        data.status,
        id,
        tenantId
      );

      db.prepare('DELETE FROM repayments WHERE loanId = ?').run(id);
      if (data.repayments && Array.isArray(data.repayments)) {
        for (const rep of data.repayments) {
          db.prepare(`
            INSERT INTO repayments (id, loanId, amount, date, note)
            VALUES (?, ?, ?, ?, ?)
          `).run(rep.id, id, rep.amount, rep.date, rep.note || null);
        }
      }

      db.prepare('DELETE FROM loan_installments WHERE loanId = ?').run(id);
      if (data.installments && Array.isArray(data.installments)) {
        for (const inst of data.installments) {
          db.prepare(`
            INSERT INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(inst.id, id, inst.dueDate, inst.amount, inst.status, inst.paidDate || null, inst.note || null);
        }
      }
    });

    const updatedLoan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as any;
    this.enqueueSync('UPDATE', id, { ...updatedLoan, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM loans WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }
}

export const loanService = new LoanService();
