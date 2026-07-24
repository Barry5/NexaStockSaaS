import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loanSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve all loans with mapped repayments and installments
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const loans = db.prepare('SELECT * FROM loans WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];

    const enrichedLoans = loans.map(loan => {
      const repayments = db.prepare('SELECT * FROM repayments WHERE loanId = ? ORDER BY date DESC').all(loan.id);
      const installments = db.prepare('SELECT * FROM loan_installments WHERE loanId = ? ORDER BY dueDate ASC').all(loan.id);
      return {
        ...loan,
        repayments,
        installments
      };
    });

    res.json(enrichedLoans);
  } catch (error) {
    next(error);
  }
});

// POST: Add new loan
router.post('/', authenticateToken, validate(loanSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const loanData = req.body;
    const loanId = loanData.id || `l-${Math.floor(Math.random() * 90000 + 10000)}`;

    db.transaction(() => {
      // Insert Loan
      db.prepare(`
        INSERT INTO loans (id, type, partnerName, amount, date, description, remainingBalance, status, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        loanId,
        loanData.type,
        loanData.partnerName,
        loanData.amount,
        loanData.date,
        loanData.description || null,
        loanData.remainingBalance,
        loanData.status || 'actif',
        tenantId
      );

      // Insert repayments if present
      if (loanData.repayments && Array.isArray(loanData.repayments)) {
        const insertRep = db.prepare(`
          INSERT INTO repayments (id, loanId, amount, date, note)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const rep of loanData.repayments) {
          insertRep.run(rep.id, loanId, rep.amount, rep.date, rep.note || null);
        }
      }

      // Insert installments if present
      if (loanData.installments && Array.isArray(loanData.installments)) {
        const insertInst = db.prepare(`
          INSERT INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const inst of loanData.installments) {
          insertInst.run(inst.id, loanId, inst.dueDate, inst.amount, inst.status || 'en_attente', inst.paidDate || null, inst.note || null);
        }
      }
    })();

    // Fetch the enriched created loan
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as any;
    const repayments = db.prepare('SELECT * FROM repayments WHERE loanId = ?').all(loanId);
    const installments = db.prepare('SELECT * FROM loan_installments WHERE loanId = ?').all(loanId);

    res.status(201).json({
      ...loan,
      repayments,
      installments
    });
  } catch (error) {
    next(error);
  }
});

// PUT: Update loan & synchronize lists
router.put('/:id', authenticateToken, validate(loanSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const loanData = req.body;

    const existingLoan = db.prepare('SELECT * FROM loans WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existingLoan) {
      return res.status(404).json({ error: 'Emprunt/prêt introuvable.' });
    }

    db.transaction(() => {
      // Update main loan info
      db.prepare(`
        UPDATE loans 
        SET type = ?, partnerName = ?, amount = ?, date = ?, description = ?, remainingBalance = ?, status = ?
        WHERE id = ? AND tenantId = ?
      `).run(
        loanData.type,
        loanData.partnerName,
        loanData.amount,
        loanData.date,
        loanData.description || null,
        loanData.remainingBalance,
        loanData.status,
        id,
        tenantId
      );

      // Simple sync approach: clear and rebuild repayments & installments
      db.prepare('DELETE FROM repayments WHERE loanId = ?').run(id);
      if (loanData.repayments && Array.isArray(loanData.repayments)) {
        const insertRep = db.prepare(`
          INSERT INTO repayments (id, loanId, amount, date, note)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const rep of loanData.repayments) {
          insertRep.run(rep.id, id, rep.amount, rep.date, rep.note || null);
        }
      }

      db.prepare('DELETE FROM loan_installments WHERE loanId = ?').run(id);
      if (loanData.installments && Array.isArray(loanData.installments)) {
        const insertInst = db.prepare(`
          INSERT INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const inst of loanData.installments) {
          insertInst.run(inst.id, id, inst.dueDate, inst.amount, inst.status, inst.paidDate || null, inst.note || null);
        }
      }
    })();

    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id) as any;
    const repayments = db.prepare('SELECT * FROM repayments WHERE loanId = ?').all(id);
    const installments = db.prepare('SELECT * FROM loan_installments WHERE loanId = ?').all(id);

    res.json({
      ...loan,
      repayments,
      installments
    });
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete loan
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const loan = db.prepare('SELECT * FROM loans WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!loan) {
      return res.status(404).json({ error: 'Emprunt/prêt introuvable.' });
    }

    db.prepare('DELETE FROM loans WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Le registre de prêt a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
