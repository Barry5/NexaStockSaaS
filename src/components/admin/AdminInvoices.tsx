import React from 'react';
import { motion } from 'motion/react';
import { Clock, XCircle, CheckCircle, Eye } from 'lucide-react';

interface AdminInvoicesProps {
  pendingPayments: any[];
  processedPayments: any[];
  adminComment: string;
  setAdminComment: (v: string) => void;
  handleProcessPayment: (paymentId: string, status: 'APPROVED' | 'REJECTED') => void;
  db: any;
}

export default function AdminInvoices({
  pendingPayments,
  processedPayments,
  adminComment,
  setAdminComment,
  handleProcessPayment,
  db,
}: AdminInvoicesProps) {
  return (
    <motion.div
      key="invoices"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Validation des reçus de paiement hors ligne</h3>
        <p className="text-xs text-gray-400 mt-1">
          Les clients du SaaS déclarent leurs paiements (Orange Money, Wave, Virement, cash) depuis leur panneau boutique. Auditez les preuves de paiement ci-dessous avant d'activer leur forfait.
        </p>
      </div>

      {/* 1. PENDING AUDIT LOGS */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
          Dossiers en attente de vérification comptable ({pendingPayments.length})
        </h4>

        {pendingPayments.length === 0 ? (
          <div className="bg-gray-950 border border-gray-850 rounded-xl p-8 text-center text-xs text-gray-500 italic">
            Aucun reçu de paiement en attente d'audit pour le moment. Tout est à jour !
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pendingPayments.map((p: any) => (
              <div key={p.id} className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4 relative overflow-hidden">
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono font-bold uppercase">{p.paymentMethod}</span>
                    <h4 className="text-sm font-black text-white mt-1.5">{p.tenantName}</h4>
                    <p className="text-[10px] text-gray-500 font-mono">Date de déclaration : {new Date(p.createdAt).toLocaleDateString('fr-FR')} à {new Date(p.createdAt).toLocaleTimeString('fr-FR')}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-gray-500">Forfait souhaité</span>
                    <p className="text-base font-black text-purple-400 font-mono">{p.planName}</p>
                    <p className="text-xs font-black text-white font-mono">{p.amount} {p.currency || db.saasCurrency || 'EUR'}</p>
                  </div>
                </div>

                {/* Transaction details card */}
                <div className="grid grid-cols-2 gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-850 text-[11px] font-mono">
                  <div>
                    <span className="text-gray-500 block">Référence :</span>
                    <span className="text-gray-300 font-bold">{p.reference}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">N° Émetteur :</span>
                    <span className="text-gray-300 font-bold">{p.transactionNumber}</span>
                  </div>
                </div>

                {p.comment && (
                  <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-850 text-[11px] text-gray-400 leading-normal">
                    <strong className="text-gray-300">Note du client :</strong> "{p.comment}"
                  </div>
                )}

                {/* Receipt Screenshot Render */}
                {p.receiptImage && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-gray-500 block">Capture d'écran du transfert :</span>
                    <div className="relative group rounded-lg overflow-hidden border border-gray-800 bg-gray-900 max-h-48">
                      <img 
                        src={p.receiptImage} 
                        alt="Capture d'écran du reçu" 
                        className="w-full h-36 object-cover hover:scale-105 transition duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80";
                        }}
                      />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <a href={p.receiptImage} target="_blank" rel="noreferrer" className="text-white text-xs font-bold underline flex items-center gap-1">
                          <Eye className="w-4 h-4" /> Ouvrir dans un nouvel onglet
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Admin Action Comments box */}
                <div className="space-y-2 pt-2 border-t border-gray-900">
                  <label className="block text-[10px] font-mono text-gray-500 uppercase">Commentaire ou motif (Sera transmis au client) :</label>
                  <input
                    type="text"
                    placeholder="ex: Versement de 29 EUR reçu sur notre compte OM le 15/07. Compte activé."
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3 py-2 text-white placeholder-gray-700 focus:outline-none"
                  />
                </div>

                {/* Validation trigger buttons */}
                <div className="flex gap-2 pt-1 justify-end">
                  <button
                    onClick={() => handleProcessPayment(p.id, 'REJECTED')}
                    className="bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 text-red-400 font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Rejeter le reçu
                  </button>
                  <button
                    onClick={() => handleProcessPayment(p.id, 'APPROVED')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1 shadow-lg shadow-emerald-500/15"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approuver & Activer
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. PROCESSED RECEIPTS ARCHIVE */}
      <div className="space-y-4 pt-4 border-t border-gray-850">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">Historique des reçus audités</h4>

        <div className="overflow-x-auto border border-gray-850 rounded-xl table-responsive">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-850">
              <tr>
                <th className="p-3">Client</th>
                <th className="p-3">Forfait</th>
                <th className="p-3">Méthode</th>
                <th className="p-3">Référence / Montant</th>
                <th className="p-3">Décision</th>
                <th className="p-3">Commentaire d'administration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850 font-medium">
              {processedPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 italic">Aucun paiement traité archivé pour le moment.</td>
                </tr>
              ) : (
                processedPayments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-950/10 transition text-gray-300">
                    <td className="p-3 font-bold text-white">{p.tenantName}</td>
                    <td className="p-3 font-mono text-[11px] text-purple-400">{p.planName}</td>
                    <td className="p-3 font-mono text-gray-400">{p.paymentMethod}</td>
                    <td className="p-3">
                      <p className="font-mono text-[11px] font-bold text-gray-200">{p.reference}</p>
                      <p className="font-mono text-[10px] text-gray-500">{p.amount} {p.currency || db.saasCurrency || 'EUR'}</p>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-black font-mono rounded uppercase ${
                        p.status === 'APPROVED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                      }`}>
                        {p.status === 'APPROVED' ? 'Validé' : 'Rejeté'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400 italic font-sans max-w-xs truncate">{p.adminComment}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </motion.div>
  );
}
