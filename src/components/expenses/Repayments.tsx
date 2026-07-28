import { Plus, Trash2, ArrowUpRight, Calendar, CheckCircle, Clock, Briefcase } from 'lucide-react';
import type { Loan, LoanInstallment } from '../../types';

interface RepaymentsProps {
  loans: Loan[];
  formattedCurrency: (val: number) => string;
  onDeleteLoan: (id: string) => void;
  onOpenRepayment: (loan: Loan) => void;
  onDeleteRepayment: (loanId: string, repaymentId: string) => void;
  onOpenInstallmentModal: (loan: Loan) => void;
  onDeleteInstallment: (loanId: string, installmentId: string) => void;
  onPayInstallment: (loanId: string, installment: LoanInstallment) => void;
  onOpenNewLoanModal: () => void;
}

export default function Repayments({ loans, formattedCurrency, onDeleteLoan, onOpenRepayment, onDeleteRepayment, onOpenInstallmentModal, onDeleteInstallment, onPayInstallment, onOpenNewLoanModal }: RepaymentsProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-200">Gestion des remboursements (Créances et Prêts Accordés)</h2>
        <p className="text-xs text-gray-400 mt-1">
          Ce module liste tous les prêts accordés par votre entreprise à des partenaires extérieurs ou employés (fonds sortants). 
          Planifiez des échéances de remboursement précises, suivez les versements et clôturez les dossiers une fois intégralement réglés.
        </p>
      </div>

      {loans.filter(l => l.type === 'sortant').length > 0 ? (
        <div className="space-y-6">
          {loans.filter(l => l.type === 'sortant').slice().reverse().map(loan => {
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
                      onClick={() => onDeleteLoan(loan.id)}
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
                          onClick={() => onOpenInstallmentModal(loan)}
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
                                      onClick={() => onPayInstallment(loan.id, inst)}
                                      className="text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded transition"
                                      title="Marquer comme payée et enregistrer le versement"
                                    >
                                      Régler
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => onDeleteInstallment(loan.id, inst.id)}
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
                          onClick={() => onOpenRepayment(loan)}
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
            onClick={onOpenNewLoanModal}
            className="mt-4 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Enregistrer un Prêt Sortant
          </button>
        </div>
      )}
    </div>
  );
}
