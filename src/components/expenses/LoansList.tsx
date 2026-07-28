import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Briefcase, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { Loan } from '../../types';

interface LoansListProps {
  loans: Loan[];
  expandedLoanId: string | null;
  onToggleExpand: (id: string | null) => void;
  formattedCurrency: (val: number) => string;
  onDeleteLoan: (id: string) => void;
  onOpenRepayment: (loan: Loan) => void;
  onDeleteRepayment: (loanId: string, repaymentId: string) => void;
}

export default function LoansList({ loans, expandedLoanId, onToggleExpand, formattedCurrency, onDeleteLoan, onOpenRepayment, onDeleteRepayment }: LoansListProps) {
  return (
    <div className="space-y-4">
      {loans.length > 0 ? (
        loans.slice().reverse().map(loan => {
          const isExpanded = expandedLoanId === loan.id;
          const isEntrant = loan.type === 'entrant';

          return (
            <div 
              key={loan.id} 
              className={`bg-gray-900 border rounded-2xl overflow-hidden transition ${
                loan.status === 'rembourse' ? 'border-gray-800 opacity-80' : isEntrant ? 'border-red-500/10' : 'border-emerald-500/10'
              }`}
            >
              {/* Summary row */}
              <div 
                onClick={() => onToggleExpand(isExpanded ? null : loan.id)}
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
                        onDeleteLoan(loan.id);
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
                        onClick={() => onOpenRepayment(loan)}
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
                              onClick={() => onDeleteRepayment(loan.id, rep.id)}
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
  );
}
