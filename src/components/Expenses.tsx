import { useState, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  Calendar, 
  Tag, 
  Briefcase, 
  CheckCircle, 
  Clock, 
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Upload
} from 'lucide-react';
import type { Expense, Loan, Repayment, LoanInstallment } from '../types';
import { useDB, useApp } from '../context';
import { ConfirmDialog } from './shared/ConfirmDialog';
import ExpenseList from './expenses/ExpenseList';
import LoansList from './expenses/LoansList';
import Repayments from './expenses/Repayments';

export default function Expenses() {
  const { db, handleUpdateExpenses, handleUpdateLoans } = useDB();
  const { activeTenantId } = useApp();
  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);

  // Tenant specific data
  const tenantExpenses = useMemo(() => {
    return db.expenses.filter(e => e.tenantId === activeTenantId);
  }, [db.expenses, activeTenantId]);

  const tenantLoans = useMemo(() => {
    return db.loans.filter(l => l.tenantId === activeTenantId);
  }, [db.loans, activeTenantId]);

  // States
  const [activeSubTab, setActiveSubTab] = useState<'expenses' | 'loans' | 'repayments'>('expenses');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [selectedLoanForRepayment, setSelectedLoanForRepayment] = useState<Loan | null>(null);
  const [recordAsExpense, setRecordAsExpense] = useState(true);

  // States for Repayment Installments (Échéances)
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [selectedLoanForInstallment, setSelectedLoanForInstallment] = useState<Loan | null>(null);
  const [installmentForm, setInstallmentForm] = useState({
    dueDate: new Date().toISOString().split('T')[0],
    amount: 0,
    note: ''
  });

  // Forms
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: 0,
    category: 'Loyer',
    date: new Date().toISOString().split('T')[0],
    recipient: '',
    paymentMethod: 'Virement',
    status: 'paye' as 'paye' | 'en_attente',
    description: '',
    attachmentName: ''
  });

  const [loanForm, setLoanForm] = useState({
    type: 'entrant' as 'entrant' | 'sortant',
    partnerName: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [repaymentForm, setRepaymentForm] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Calculations
  const expenseStats = useMemo(() => {
    const paid = tenantExpenses.filter(e => e.status === 'paye').reduce((s, e) => s + e.amount, 0);
    const pending = tenantExpenses.filter(e => e.status === 'en_attente').reduce((s, e) => s + e.amount, 0);
    return { paid, pending };
  }, [tenantExpenses]);

  const loanStats = useMemo(() => {
    let weOwe = 0; // entrant loans
    let weAreOwed = 0; // sortant loans
    tenantLoans.forEach(l => {
      if (l.status === 'actif') {
        if (l.type === 'entrant') weOwe += l.remainingBalance;
        if (l.type === 'sortant') weAreOwed += l.remainingBalance;
      }
    });
    return { weOwe, weAreOwed };
  }, [tenantLoans]);

  const repaymentStats = useMemo(() => {
    const grantedLoans = tenantLoans.filter(l => l.type === 'sortant');
    const totalLent = grantedLoans.reduce((sum, l) => sum + l.amount, 0);
    const totalRemaining = grantedLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
    const totalRepaid = Math.max(0, totalLent - totalRemaining);
    const activeCount = grantedLoans.filter(l => l.status === 'actif').length;
    const closedCount = grantedLoans.filter(l => l.status === 'rembourse').length;
    return { totalLent, totalRemaining, totalRepaid, activeCount, closedCount };
  }, [tenantLoans]);

  // Actions
  const handleAddExpense = (e: FormEvent) => {
    e.preventDefault();
    if (!expenseForm.title.trim() || expenseForm.amount <= 0) return;

    const newExpense: Expense = {
      id: `e-${Date.now()}`,
      title: expenseForm.title,
      amount: Number(expenseForm.amount),
      category: expenseForm.category,
      date: expenseForm.date,
      description: expenseForm.description,
      recipient: expenseForm.recipient,
      paymentMethod: expenseForm.paymentMethod,
      status: expenseForm.status,
      attachment: expenseForm.attachmentName ? `justificatif_${Date.now()}.pdf` : undefined,
      tenantId: activeTenantId
    };

    handleUpdateExpenses([...db.expenses, newExpense]);
    setIsExpenseModalOpen(false);
    
    // Clear form
    setExpenseForm({
      title: '',
      amount: 0,
      category: 'Loyer',
      date: new Date().toISOString().split('T')[0],
      recipient: '',
      paymentMethod: 'Virement',
      status: 'paye',
      description: '',
      attachmentName: ''
    });
  };

  const handleAddLoan = (e: FormEvent) => {
    e.preventDefault();
    if (!loanForm.partnerName.trim() || loanForm.amount <= 0) return;

    const newLoan: Loan = {
      id: `l-${Date.now()}`,
      type: loanForm.type,
      partnerName: loanForm.partnerName,
      amount: Number(loanForm.amount),
      date: loanForm.date,
      description: loanForm.description,
      repayments: [],
      remainingBalance: Number(loanForm.amount),
      status: 'actif',
      tenantId: activeTenantId
    };

    handleUpdateLoans([...db.loans, newLoan]);
    setIsLoanModalOpen(false);

    // Clear form
    setLoanForm({
      type: 'entrant',
      partnerName: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      description: ''
    });
  };

  const handleOpenRepayment = (loan: Loan) => {
    setSelectedLoanForRepayment(loan);
    setRepaymentForm({
      amount: Math.min(1000, loan.remainingBalance),
      date: new Date().toISOString().split('T')[0],
      note: 'Remboursement partiel'
    });
    setIsRepaymentModalOpen(true);
  };

  const handleAddRepayment = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLoanForRepayment || repaymentForm.amount <= 0) return;

    const repaymentAmount = Number(repaymentForm.amount);
    if (repaymentAmount > selectedLoanForRepayment.remainingBalance) {
      alert("Le remboursement ne peut pas excéder le solde restant dû.");
      return;
    }

    const updatedLoans = db.loans.map(l => {
      if (l.id === selectedLoanForRepayment.id) {
        const newRepayment: Repayment = {
          id: `rep-${Date.now()}`,
          amount: repaymentAmount,
          date: repaymentForm.date,
          note: repaymentForm.note || 'Remboursement'
        };
        const nextRepayments = [...l.repayments, newRepayment];
        const nextBalance = Math.max(0, l.remainingBalance - repaymentAmount);
        
        return {
          ...l,
          repayments: nextRepayments,
          remainingBalance: nextBalance,
          status: nextBalance === 0 ? 'rembourse' as const : 'actif' as const
        };
      }
      return l;
    });

    handleUpdateLoans(updatedLoans);

    // If recording as expense for cash outflows
    if (recordAsExpense && selectedLoanForRepayment.type === 'entrant') {
      const newExpense: Expense = {
        id: `e-rep-${Date.now()}`,
        title: `Remboursement prêt : ${selectedLoanForRepayment.partnerName}`,
        amount: repaymentAmount,
        category: 'Impôts', // fallback to Impôts / generic charges or we can add "Remboursement Prêt"
        date: repaymentForm.date,
        description: repaymentForm.note || `Remboursement partiel du prêt contracté auprès de ${selectedLoanForRepayment.partnerName}`,
        recipient: selectedLoanForRepayment.partnerName,
        paymentMethod: 'Virement',
        status: 'paye',
        tenantId: activeTenantId
      };
    handleUpdateExpenses([...db.expenses, newExpense]);
    }

    setIsRepaymentModalOpen(false);
    setSelectedLoanForRepayment(null);
  };

  const handleDeleteRepayment = (loanId: string, repaymentId: string) => {
    setConfirmAction({
      isOpen: true,
      title: 'Annuler un remboursement',
      message: 'Voulez-vous annuler ce remboursement ? Le solde restant dû du dossier financier sera ajusté automatiquement.',
      onConfirm: () => {
        const updatedLoans = db.loans.map(l => {
          if (l.id === loanId) {
            const repToRemove = l.repayments.find(r => r.id === repaymentId);
            if (!repToRemove) return l;

            const nextRepayments = l.repayments.filter(r => r.id !== repaymentId);
            const nextBalance = l.remainingBalance + repToRemove.amount;

            return {
              ...l,
              repayments: nextRepayments,
              remainingBalance: nextBalance,
              status: nextBalance === 0 ? 'rembourse' as const : 'actif' as const
            };
          }
          return l;
        });

        handleUpdateLoans(updatedLoans);
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleOpenInstallmentModal = (loan: Loan) => {
    setSelectedLoanForInstallment(loan);
    setInstallmentForm({
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 jours plus tard par défaut
      amount: Math.min(1000, loan.remainingBalance),
      note: 'Échéance de remboursement'
    });
    setIsInstallmentModalOpen(true);
  };

  const handleAddInstallment = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLoanForInstallment || installmentForm.amount <= 0) return;

    const newInstallment: LoanInstallment = {
      id: `inst-${Date.now()}`,
      dueDate: installmentForm.dueDate,
      amount: Number(installmentForm.amount),
      status: 'en_attente' as const,
      note: installmentForm.note || 'Échéance de remboursement'
    };

    const updatedLoans = db.loans.map(l => {
      if (l.id === selectedLoanForInstallment.id) {
        const currentInstallments = l.installments || [];
        return {
          ...l,
          installments: [...currentInstallments, newInstallment]
        };
      }
      return l;
    });

    handleUpdateLoans(updatedLoans);
    setIsInstallmentModalOpen(false);
    setSelectedLoanForInstallment(null);
  };

  const handleDeleteInstallment = (loanId: string, installmentId: string) => {
    setConfirmAction({
      isOpen: true,
      title: 'Supprimer une échéance',
      message: 'Voulez-vous supprimer cette échéance de remboursement ?',
      onConfirm: () => {
        const updatedLoans = db.loans.map(l => {
          if (l.id === loanId) {
            const currentInstallments = l.installments || [];
            return {
              ...l,
              installments: currentInstallments.filter(i => i.id !== installmentId)
            };
          }
          return l;
        });

        handleUpdateLoans(updatedLoans);
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handlePayInstallment = (loanId: string, installment: LoanInstallment) => {
    const repaymentAmount = installment.amount;
    const repaymentDate = new Date().toISOString().split('T')[0];
    
    const updatedLoans = db.loans.map(l => {
      if (l.id === loanId) {
        if (repaymentAmount > l.remainingBalance) {
          alert("Erreur: Le montant de l'échéance dépasse le solde restant dû du prêt.");
          return l;
        }

        const newRepayment: Repayment = {
          id: `rep-${Date.now()}`,
          amount: repaymentAmount,
          date: repaymentDate,
          note: `Règlement d'échéance (${installment.dueDate})`
        };

        const nextRepayments = [...l.repayments, newRepayment];
        const nextBalance = Math.max(0, l.remainingBalance - repaymentAmount);

        const currentInstallments = l.installments || [];
        const nextInstallments = currentInstallments.map(inst => {
          if (inst.id === installment.id) {
            return {
              ...inst,
              status: 'paye' as const,
              paidDate: repaymentDate
            };
          }
          return inst;
        });

        return {
          ...l,
          repayments: nextRepayments,
          remainingBalance: nextBalance,
          status: nextBalance === 0 ? 'rembourse' as const : 'actif' as const,
          installments: nextInstallments
        };
      }
      return l;
    });

    handleUpdateLoans(updatedLoans);
  };

  const handleDeleteLoan = (id: string) => {
    setConfirmAction({
      isOpen: true,
      title: 'Supprimer un dossier',
      message: 'Voulez-vous supprimer définitivement ce dossier de prêt / dette ?',
      onConfirm: () => {
        const updated = db.loans.filter(l => l.id !== id);
        handleUpdateLoans(updated);
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteExpense = (id: string) => {
    setConfirmAction({
      isOpen: true,
      title: 'Supprimer une dépense',
      message: 'Voulez-vous supprimer cette écriture de dépenses ?',
      onConfirm: () => {
        const updated = db.expenses.filter(e => e.id !== id);
        handleUpdateExpenses(updated);
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const formattedCurrency = (val: number) => {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: (activeTenant?.currency || 'EUR').toUpperCase().trim()
      }).format(val);
    } catch (e) {
      return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}`;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Module Dépenses & Financements</h1>
          <p className="text-xs text-gray-400">Analyse de trésorerie, crédits bailleurs et sorties d'argent</p>
        </div>

        <div className="flex gap-2">
          {activeSubTab === 'expenses' ? (
            <button 
              onClick={() => setIsExpenseModalOpen(true)}
              className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
            >
              <Plus className="w-4 h-4" /> Saisir Sortie
            </button>
          ) : (
            <button 
              onClick={() => setIsLoanModalOpen(true)}
              className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
            >
              <Plus className="w-4 h-4" /> Enregistrer un Prêt
            </button>
          )}
        </div>
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex border-b border-gray-800 tabs-scrollable">
        <button
          onClick={() => setActiveSubTab('expenses')}
          className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'expenses' 
              ? 'border-brand-blue text-white bg-blue-500/5' 
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Sorties d'Argent & Charges
        </button>
        <button
          onClick={() => setActiveSubTab('loans')}
          className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'loans' 
              ? 'border-brand-blue text-white bg-blue-500/5' 
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Gestion des Prêts & Dettes
        </button>
        <button
          onClick={() => setActiveSubTab('repayments')}
          className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'repayments' 
              ? 'border-brand-blue text-white bg-blue-500/5' 
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Gestion des Remboursements
        </button>
      </div>

      {/* Stats Cards Dashboard depending on active sub-tab */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeSubTab === 'expenses' ? (
          <>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Total Dépenses Payées</span>
              <h3 className="text-xl font-bold font-mono text-white mt-1">{formattedCurrency(expenseStats.paid)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Charges déduites du bénéfice</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">En Attente de Paiement</span>
              <h3 className="text-xl font-bold font-mono text-amber-500 mt-1">{formattedCurrency(expenseStats.pending)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Factures engagées non réglées</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Total des Écritures</span>
              <h3 className="text-xl font-bold font-mono text-white mt-1">{tenantExpenses.length} lignes</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Audit comptable d'exploitation</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Frais Récurrents</span>
              <h3 className="text-xl font-bold font-mono text-brand-blue mt-1">Loyer, Électricité</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Catégories d'exploitation fixes</p>
            </div>
          </>
        ) : activeSubTab === 'loans' ? (
          <>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Dettes Actives (Nous devons)</span>
              <h3 className="text-xl font-bold font-mono text-red-400 mt-1">{formattedCurrency(loanStats.weOwe)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Remboursements restants à effectuer</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Créances Actives (On nous doit)</span>
              <h3 className="text-xl font-bold font-mono text-brand-green mt-1">{formattedCurrency(loanStats.weAreOwed)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Créances extérieures remboursables</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Prêts Remboursés</span>
              <h3 className="text-xl font-bold font-mono text-white mt-1">
                {tenantLoans.filter(l => l.status === 'rembourse').length} dossiers
              </h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Dossiers clôturés et archivés</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Dettes Équilibrées</span>
              <h3 className="text-xl font-bold font-mono text-white mt-1">
                {formattedCurrency(tenantLoans.reduce((acc, l) => acc + l.amount, 0))}
              </h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Volume de financement historique</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Total des Prêts Accordés</span>
              <h3 className="text-xl font-bold font-mono text-brand-blue mt-1">{formattedCurrency(repaymentStats.totalLent)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Volume total des fonds prêtés</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-emerald-400 block uppercase">Montant Remboursé</span>
              <h3 className="text-xl font-bold font-mono text-emerald-400 mt-1">{formattedCurrency(repaymentStats.totalRepaid)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Capital déjà récupéré</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-amber-500 block uppercase">Solde Restant Dû</span>
              <h3 className="text-xl font-bold font-mono text-amber-500 mt-1">{formattedCurrency(repaymentStats.totalRemaining)}</h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Capital encore en circulation</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4.5 rounded-2xl">
              <span className="text-[10px] font-mono text-gray-500 block uppercase">Statut Dossiers</span>
              <h3 className="text-xl font-bold font-mono text-white mt-1">
                {repaymentStats.activeCount} Actifs / {repaymentStats.closedCount} Soldés
              </h3>
              <p className="text-[9px] text-gray-500 mt-0.5">Suivi de clôture de portefeuille</p>
            </div>
          </>
        )}
      </div>

      {/* Main Tab View: Sorties d'Argent Expense Ledger */}
      {activeSubTab === 'expenses' && (
        <ExpenseList
          expenses={tenantExpenses}
          formattedCurrency={formattedCurrency}
          onDeleteExpense={handleDeleteExpense}
        />
      )}

      {/* Main Tab View: Prêts & Dettes Loans Ledger */}
      {activeSubTab === 'loans' && (
        <LoansList
          loans={tenantLoans}
          expandedLoanId={expandedLoanId}
          onToggleExpand={setExpandedLoanId}
          formattedCurrency={formattedCurrency}
          onDeleteLoan={handleDeleteLoan}
          onOpenRepayment={handleOpenRepayment}
          onDeleteRepayment={handleDeleteRepayment}
        />
      )}

      {/* Main Tab View: Gestion des Remboursements (Prêts Accordés) */}
      {activeSubTab === 'repayments' && (
        <Repayments
          loans={tenantLoans}
          formattedCurrency={formattedCurrency}
          onDeleteLoan={handleDeleteLoan}
          onOpenRepayment={handleOpenRepayment}
          onDeleteRepayment={handleDeleteRepayment}
          onOpenInstallmentModal={handleOpenInstallmentModal}
          onDeleteInstallment={handleDeleteInstallment}
          onPayInstallment={handlePayInstallment}
          onOpenNewLoanModal={() => setIsLoanModalOpen(true)}
        />
      )}

      {/* CREATE INSTALLMENT (ÉCHÉANCE) MODAL */}
      <AnimatePresence>
        {isInstallmentModalOpen && selectedLoanForInstallment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full modal-responsive"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white">Planifier une Échéance</h3>
                <button onClick={() => { setIsInstallmentModalOpen(false); setSelectedLoanForInstallment(null); }} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                Planification d'une échéance de remboursement pour le prêt accordé à <strong className="text-white">{selectedLoanForInstallment.partnerName}</strong>.
              </p>

              <form onSubmit={handleAddInstallment} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Date d'échéance *</label>
                  <input 
                    type="date" 
                    required
                    value={installmentForm.dueDate}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, dueDate: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Montant prévu * ({activeTenant?.currency})</label>
                  <input 
                    type="number" 
                    min="1"
                    max={selectedLoanForInstallment.remainingBalance}
                    required
                    value={installmentForm.amount || ''}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, amount: Number(e.target.value) })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Note (optionnel)</label>
                  <input 
                    type="text" 
                    value={installmentForm.note}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, note: e.target.value })}
                    placeholder="ex: Échéance mensuelle n°2"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button 
                    type="button" 
                    onClick={() => { setIsInstallmentModalOpen(false); setSelectedLoanForInstallment(null); }}
                    className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl"
                  >
                    Enregistrer Échéance
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE EXPENSE MODAL */}
      <AnimatePresence>
        {isExpenseModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full modal-responsive"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white">Saisir une Sortie d'Argent</h3>
                <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Motif / Désignation *</label>
                  <input 
                    type="text" 
                    required
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                    placeholder="ex: Facture électricité EDF"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Montant * ({activeTenant?.currency})</label>
                    <input 
                      type="number" 
                      min="0.1" 
                      step="any"
                      required
                      value={expenseForm.amount || ''}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Catégorie</label>
                    <select 
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                    >
                      <option value="Loyer">Loyer Commercial</option>
                      <option value="Électricité">Électricité / Eau</option>
                      <option value="Salaires">Salaires Employés</option>
                      <option value="Achat Stock">Approvisionnement Stock</option>
                      <option value="Marketing">Marketing / PLV</option>
                      <option value="Fournitures">Fournitures de Bureau</option>
                      <option value="Impôts">Impôts & Taxes</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Date d'effet</label>
                    <input 
                      type="date" 
                      required
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Bénéficiaire / Tiers</label>
                    <input 
                      type="text" 
                      value={expenseForm.recipient}
                      onChange={(e) => setExpenseForm({ ...expenseForm, recipient: e.target.value })}
                      placeholder="ex: EDF S.A."
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Mode de règlement</label>
                    <select 
                      value={expenseForm.paymentMethod}
                      onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                    >
                      <option value="Virement">Virement Bancaire</option>
                      <option value="Carte Bancaire">Carte Bancaire</option>
                      <option value="Espèces">Espèces de Caisse</option>
                      <option value="Chèque">Chèque</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Statut initial</label>
                    <select 
                      value={expenseForm.status}
                      onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value as 'paye' | 'en_attente' })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                    >
                      <option value="paye">Payé & Réglé</option>
                      <option value="en_attente">En attente de paiement</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Ajouter Justificatif (Optionnel)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={expenseForm.attachmentName}
                      onChange={(e) => setExpenseForm({ ...expenseForm, attachmentName: e.target.value })}
                      placeholder="Nom de fichier joint (ex: facture_edf.pdf)..."
                      className="w-full bg-gray-950 border border-gray-800 text-[11px] text-white rounded-xl px-3.5 py-2.5 outline-none"
                    />
                    <button 
                      type="button"
                      onClick={() => setExpenseForm({ ...expenseForm, attachmentName: 'facture_charge.pdf' })}
                      className="p-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 rounded-xl"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-800 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsExpenseModalOpen(false)}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/15"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE LOAN / DEBT MODAL */}
      <AnimatePresence>
        {isLoanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full modal-responsive"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white">Créer un Dossier de Financement</h3>
                <button onClick={() => setIsLoanModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddLoan} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Type de Contrat *</label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setLoanForm({ ...loanForm, type: 'entrant' })}
                      className={`py-2 rounded-xl border text-center transition ${
                        loanForm.type === 'entrant' 
                          ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                          : 'bg-gray-950 text-gray-500 border-gray-850'
                      }`}
                    >
                      Emprunt contracté (Nous devons)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoanForm({ ...loanForm, type: 'sortant' })}
                      className={`py-2 rounded-xl border text-center transition ${
                        loanForm.type === 'sortant' 
                          ? 'bg-emerald-500/10 text-brand-green border-emerald-500/20' 
                          : 'bg-gray-950 text-gray-500 border-gray-850'
                      }`}
                    >
                      Fonds prêtés (On nous doit)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Partenaire Financier / Tiers *</label>
                  <input 
                    type="text" 
                    required
                    value={loanForm.partnerName}
                    onChange={(e) => setLoanForm({ ...loanForm, partnerName: e.target.value })}
                    placeholder="ex: Banque Populaire, ou Société Partenaire ABC"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Capital d'origine *</label>
                    <input 
                      type="number" 
                      min="1" 
                      required
                      value={loanForm.amount || ''}
                      onChange={(e) => setLoanForm({ ...loanForm, amount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Date d'effet</label>
                    <input 
                      type="date" 
                      required
                      value={loanForm.date}
                      onChange={(e) => setLoanForm({ ...loanForm, date: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Description / Notes contractuelles</label>
                  <textarea 
                    value={loanForm.description}
                    onChange={(e) => setLoanForm({ ...loanForm, description: e.target.value })}
                    placeholder="Prêt amortissable sur 24 mois à 1.5%..."
                    rows={3}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none resize-none"
                  />
                </div>

                <div className="pt-3 border-t border-gray-800 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsLoanModalOpen(false)}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl"
                  >
                    Créer Dossier
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REPAYMENT RECORD MODAL */}
      <AnimatePresence>
        {isRepaymentModalOpen && selectedLoanForRepayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full modal-responsive"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white">Comptabiliser Versement</h3>
                <button onClick={() => setIsRepaymentModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              <p className="text-xs text-gray-400 mb-4">
                Enregistrement d'un versement pour le contrat de <strong className="text-white">{selectedLoanForRepayment.partnerName}</strong>. 
                Solde actuel restant : <strong className="text-gray-200">{formattedCurrency(selectedLoanForRepayment.remainingBalance)}</strong>.
              </p>

              <form onSubmit={handleAddRepayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Montant du versement * ({activeTenant?.currency})</label>
                  <input 
                    type="number" 
                    min="1"
                    max={selectedLoanForRepayment.remainingBalance}
                    required
                    value={repaymentForm.amount || ''}
                    onChange={(e) => setRepaymentForm({ ...repaymentForm, amount: Number(e.target.value) })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Date du règlement</label>
                  <input 
                    type="date" 
                    required
                    value={repaymentForm.date}
                    onChange={(e) => setRepaymentForm({ ...repaymentForm, date: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Note de versement</label>
                  <input 
                    type="text" 
                    value={repaymentForm.note}
                    onChange={(e) => setRepaymentForm({ ...repaymentForm, note: e.target.value })}
                    placeholder="ex: Mensualité Juin, Virement reçu..."
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                  />
                </div>

                {selectedLoanForRepayment.type === 'entrant' && (
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="recordAsExpenseCheckbox"
                      checked={recordAsExpense}
                      onChange={(e) => setRecordAsExpense(e.target.checked)}
                      className="rounded border-gray-800 text-blue-600 focus:ring-blue-500 bg-gray-950 w-4 h-4"
                    />
                    <label htmlFor="recordAsExpenseCheckbox" className="text-[11px] text-gray-400 select-none cursor-pointer">
                      Enregistrer également comme sortie de caisse (Registre des dépenses)
                    </label>
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2.5">
                  <button 
                    type="button" 
                    onClick={() => setIsRepaymentModalOpen(false)}
                    className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl"
                  >
                    Enregistrer Remboursement
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmAction.isOpen}
        title={confirmAction.title}
        message={confirmAction.message}
        onConfirm={confirmAction.onConfirm}
        onCancel={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
