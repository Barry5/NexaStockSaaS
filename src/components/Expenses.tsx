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
      <div className="flex border-b border-gray-800">
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 bg-gray-950/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Registre Historique des Dépenses</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 text-gray-400 font-mono text-[10px] uppercase border-b border-gray-800">
                <tr>
                  <th className="p-4">Désignation & Motif</th>
                  <th className="p-4">Montant</th>
                  <th className="p-4">Catégorie</th>
                  <th className="p-4">Bénéficiaire</th>
                  <th className="p-4">Règlement</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Justificatif</th>
                  <th className="p-4">Statut</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850">
                {tenantExpenses.length > 0 ? (
                  tenantExpenses.slice().reverse().map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-950/40 transition">
                      <td className="p-4">
                        <p className="font-bold text-gray-200">{exp.title}</p>
                        {exp.description && <p className="text-[10px] text-gray-500 mt-0.5">{exp.description}</p>}
                      </td>
                      <td className="p-4 font-mono font-semibold text-white">{formattedCurrency(exp.amount)}</td>
                      <td className="p-4">
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
                          <Tag className="w-3 h-3 text-brand-blue" /> {exp.category}
                        </span>
                      </td>
                      <td className="p-4 text-gray-300">{exp.recipient || 'N/A'}</td>
                      <td className="p-4 text-gray-400 font-mono text-[10px]">{exp.paymentMethod}</td>
                      <td className="p-4 text-gray-400 font-mono">{exp.date}</td>
                      <td className="p-4">
                        {exp.attachment ? (
                          <span className="text-[10px] font-semibold text-brand-blue hover:underline cursor-pointer flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" /> justificatif.pdf
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-600 italic">Aucun</span>
                        )}
                      </td>
                      <td className="p-4">
                        {exp.status === 'paye' ? (
                          <span className="bg-emerald-500/10 text-brand-green px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/10 inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> PAYÉ
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/15 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ATTENTE
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"
                          title="Supprimer la dépense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-500">
                      Aucune dépense enregistrée dans cette boutique.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Tab View: Prêts & Dettes Loans Ledger */}
      {activeSubTab === 'loans' && (
        <div className="space-y-4">
          {tenantLoans.length > 0 ? (
            tenantLoans.slice().reverse().map(loan => {
              const isExpanded = expandedLoanId === loan.id;
              const isEntrant = loan.type === 'entrant'; // borrowed

              return (
                <div 
                  key={loan.id} 
                  className={`bg-gray-900 border rounded-2xl overflow-hidden transition ${
                    loan.status === 'rembourse' ? 'border-gray-800 opacity-80' : isEntrant ? 'border-red-500/10' : 'border-emerald-500/10'
                  }`}
                >
                  {/* Summary row */}
                  <div 
                    onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                    className="p-4.5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 cursor-pointer hover:bg-gray-950/20 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${
                        isEntrant 
                          ? 'bg-red-500/10 border-red-500/10 text-red-400' 
                          : 'bg-emerald-500/10 border-emerald-500/10 text-brand-green'
                      }`}>
                        {isEntrant ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-gray-200">
                          {isEntrant ? 'Emprunt contracté' : 'Fonds prêtés'} • {loan.partnerName}
                        </h3>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                          Initial: {formattedCurrency(loan.amount)} | Contracté le : {loan.date}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 justify-between sm:justify-start">
                      <div className="text-left sm:text-right">
                        <span className="text-[9px] text-gray-500 block uppercase font-mono">Solde restant dû</span>
                        <span className={`text-sm font-mono font-bold ${
                          loan.status === 'rembourse' ? 'text-gray-400 line-through' : isEntrant ? 'text-red-400' : 'text-brand-green'
                        }`}>
                          {formattedCurrency(loan.remainingBalance)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {loan.status === 'rembourse' ? (
                          <span className="bg-emerald-500/10 text-brand-green text-[9px] font-bold px-2 py-0.5 rounded border border-emerald-500/10 uppercase tracking-wider">
                            Remboursé
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-500/15 uppercase tracking-wider">
                            Actif
                          </span>
                        )}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLoan(loan.id);
                          }}
                          className="p-1.5 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"
                          title="Supprimer ce dossier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Repayments details and action */}
                  {isExpanded && (
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      className="border-t border-gray-800 bg-gray-950/60 p-4.5 space-y-4"
                    >
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-semibold text-gray-400">Historique des remboursements</h4>
                        {loan.status === 'actif' && (
                          <button
                            onClick={() => handleOpenRepayment(loan)}
                            className="bg-brand-blue hover:bg-blue-600 text-white font-semibold text-[10px] px-2.5 py-1.5 rounded-lg transition"
                          >
                            Ajouter un remboursement
                          </button>
                        )}
                      </div>

                      {loan.repayments.length > 0 ? (
                        <div className="space-y-2">
                          {loan.repayments.map(rep => (
                            <div key={rep.id} className="flex justify-between items-center bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs font-mono">
                              <div>
                                <p className="font-semibold text-gray-200">Remboursement de {formattedCurrency(rep.amount)}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{rep.note} | Date : {rep.date}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">Validé</span>
                                <button
                                  onClick={() => handleDeleteRepayment(loan.id, rep.id)}
                                  className="p-1 hover:bg-red-950 hover:text-red-400 rounded transition text-gray-500"
                                  title="Annuler ce versement"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic py-2 text-center">Aucun versement n'a encore été comptabilisé sur ce dossier financier.</p>
                      )}

                      {loan.description && (
                        <div className="bg-gray-900/40 p-3 rounded-lg text-xs text-gray-400 border border-gray-800">
                          <strong>Note de contrat :</strong> {loan.description}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-gray-900 border border-gray-800 rounded-2xl">
              <Briefcase className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-400">Aucun emprunt ni prêt actif</p>
              <p className="text-xs text-gray-500 mt-1">Utilisez l'enregistreur de prêts pour suivre vos contrats financiers.</p>
            </div>
          )}
        </div>
      )}

      {/* Main Tab View: Gestion des Remboursements (Prêts Accordés) */}
      {activeSubTab === 'repayments' && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
            <h2 className="text-sm font-bold text-gray-200">Gestion des remboursements (Créances et Prêts Accordés)</h2>
            <p className="text-xs text-gray-400 mt-1">
              Ce module liste tous les prêts accordés par votre entreprise à des partenaires extérieurs ou employés (fonds sortants). 
              Planifiez des échéances de remboursement précises, suivez les versements et clôturez les dossiers une fois intégralement réglés.
            </p>
          </div>

          {tenantLoans.filter(l => l.type === 'sortant').length > 0 ? (
            <div className="space-y-6">
              {tenantLoans.filter(l => l.type === 'sortant').slice().reverse().map(loan => {
                const totalRepaid = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
                const percentRepaid = Math.min(100, Math.round((totalRepaid / loan.amount) * 100)) || 0;
                const installments = loan.installments || [];

                return (
                  <div 
                    key={loan.id} 
                    className={`bg-gray-900 border rounded-2xl overflow-hidden p-5 space-y-5 transition ${
                      loan.status === 'rembourse' ? 'border-gray-850 opacity-85' : 'border-gray-800'
                    }`}
                  >
                    {/* Top Row: Information & Status */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/10 text-brand-green rounded-lg">
                            <ArrowUpRight className="w-4 h-4" />
                          </span>
                          <h3 className="text-base font-bold text-white">
                            Prêt accordé à : {loan.partnerName}
                          </h3>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 font-mono">
                          ID: {loan.id} • Date de versement : {loan.date} • Capital initial : {formattedCurrency(loan.amount)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {loan.status === 'rembourse' ? (
                          <span className="bg-emerald-500/10 text-brand-green text-[10px] font-bold px-3 py-1 rounded border border-emerald-500/20 uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Soldé (Remboursé)
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 text-[10px] font-bold px-3 py-1 rounded border border-amber-500/20 uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Actif (En cours)
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteLoan(loan.id)}
                          className="p-1.5 bg-red-950/20 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"
                          title="Supprimer ce dossier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Progress block */}
                    <div className="bg-gray-950/40 p-4 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-medium">Progression du remboursement</span>
                        <span className="font-mono font-bold text-emerald-400">{percentRepaid}% ({formattedCurrency(totalRepaid)} remboursés)</span>
                      </div>
                      <div className="w-full bg-gray-850 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentRepaid}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 pt-1">
                        <span>Lancement : {loan.date}</span>
                        <span>Solde restant dû : <strong className="text-amber-500">{formattedCurrency(loan.remainingBalance)}</strong></span>
                      </div>
                    </div>

                    {/* Bento Split: Installments and Real Payments */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Left side: Échéancier (Installments) */}
                      <div className="bg-gray-950/20 border border-gray-850 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-850">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-brand-blue" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">Échéancier de Remboursement</h4>
                          </div>
                          {loan.status === 'actif' && (
                            <button
                              onClick={() => handleOpenInstallmentModal(loan)}
                              className="text-[10px] font-semibold bg-brand-blue/10 hover:bg-brand-blue text-brand-blue hover:text-white px-2 py-1 rounded transition flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Ajouter échéance
                            </button>
                          )}
                        </div>

                        {installments.length > 0 ? (
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {installments.map(inst => (
                              <div 
                                key={inst.id} 
                                className={`p-2.5 rounded-xl text-xs flex justify-between items-center border ${
                                  inst.status === 'paye' 
                                    ? 'bg-emerald-950/10 border-emerald-950/20 opacity-75' 
                                    : 'bg-gray-900 border-gray-800'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-200">
                                      {formattedCurrency(inst.amount)}
                                    </span>
                                    {inst.note && <span className="text-[10px] text-gray-500">({inst.note})</span>}
                                  </div>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    Échéance : <span className="font-mono font-semibold">{inst.dueDate}</span>
                                    {inst.paidDate && <span className="text-emerald-400"> • Réglée le {inst.paidDate}</span>}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {inst.status === 'paye' ? (
                                    <span className="text-[9px] font-bold text-brand-green bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 uppercase tracking-wider font-mono">
                                      Payée
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-[9px] font-bold text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 uppercase tracking-wider font-mono">
                                        En attente
                                      </span>
                                      {loan.status === 'actif' && (
                                        <button
                                          onClick={() => handlePayInstallment(loan.id, inst)}
                                          className="text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded transition"
                                          title="Marquer comme payée et enregistrer le versement"
                                        >
                                          Régler
                                        </button>
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleDeleteInstallment(loan.id, inst.id)}
                                    className="p-1 text-gray-500 hover:text-red-400 rounded transition"
                                    title="Supprimer cette échéance"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-gray-500 text-xs italic">
                            Aucune échéance planifiée pour ce prêt. Cliquez sur "Ajouter échéance" pour définir un échéancier.
                          </div>
                        )}
                      </div>

                      {/* Right side: Récapitulatif des versements (Real Payments received) */}
                      <div className="bg-gray-950/20 border border-gray-850 p-4 rounded-xl space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-850">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">Versements Comptabilisés</h4>
                          </div>
                          {loan.status === 'actif' && (
                            <button
                              onClick={() => handleOpenRepayment(loan)}
                              className="text-[10px] font-semibold bg-emerald-500/10 hover:bg-emerald-500 text-brand-green hover:text-white px-2.5 py-1 rounded transition flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Versement libre
                            </button>
                          )}
                        </div>

                        {loan.repayments.length > 0 ? (
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {loan.repayments.map(rep => (
                              <div key={rep.id} className="p-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-semibold text-gray-200">Versement de {formattedCurrency(rep.amount)}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{rep.note} | Date : {rep.date}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-brand-green bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 font-mono">Validé</span>
                                  <button
                                    onClick={() => handleDeleteRepayment(loan.id, rep.id)}
                                    className="p-1 hover:bg-red-950 hover:text-red-400 rounded transition text-gray-500"
                                    title="Annuler ce versement"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-6 text-center text-gray-500 text-xs italic">
                            Aucun versement n'a été enregistré pour ce prêt.
                          </div>
                        )}
                      </div>
                    </div>

                    {loan.description && (
                      <div className="text-xs text-gray-400 bg-gray-950/30 p-3 rounded-xl border border-gray-850/50">
                        <strong>Notes contractuelles :</strong> {loan.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center bg-gray-900 border border-gray-800 rounded-2xl">
              <Briefcase className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-400">Aucun prêt accordé (fonds sortants) enregistré</p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Les dossiers d'emprunt ou de dette contractés (entrant) se gèrent dans l'onglet principal "Gestion des Prêts & Dettes". 
                Pour suivre vos créances ou prêts accordés à des tiers (sortant), enregistrez d'abord un prêt.
              </p>
              <button
                onClick={() => setIsLoanModalOpen(true)}
                className="mt-4 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Enregistrer un Prêt Sortant
              </button>
            </div>
          )}
        </div>
      )}

      {/* CREATE INSTALLMENT (ÉCHÉANCE) MODAL */}
      <AnimatePresence>
        {isInstallmentModalOpen && selectedLoanForInstallment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full"
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
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full"
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
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full"
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
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full"
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
