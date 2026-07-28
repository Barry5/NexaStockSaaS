import { CheckCircle, Clock, FileText, Tag, Trash2 } from 'lucide-react';
import type { Expense } from '../../types';

interface ExpenseListProps {
  expenses: Expense[];
  formattedCurrency: (val: number) => string;
  onDeleteExpense: (id: string) => void;
}

export default function ExpenseList({ expenses, formattedCurrency, onDeleteExpense }: ExpenseListProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 bg-gray-950/20">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Registre Historique des Dépenses</h3>
      </div>

      <div className="overflow-x-auto table-responsive">
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
            {expenses.length > 0 ? (
              expenses.slice().reverse().map(exp => (
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
                      onClick={() => onDeleteExpense(exp.id)}
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
  );
}
