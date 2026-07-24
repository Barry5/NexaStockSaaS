import { motion } from 'motion/react';
import {
  Search, FileText, Printer, Send, RotateCcw, FileCheck,
  Settings, Calendar, History
} from 'lucide-react';
import type { PaymentHistoryItem } from '../../types';
import { getSaleDisplayState } from '../../services/posHistory';

interface POSHistoriqueProps {
  historySearch: string; setHistorySearch: (v: string) => void;
  historyFilterStatus: string; setHistoryFilterStatus: (v: string) => void;
  filteredHistory: any[];
  activeSaleDetail: any;
  selectedSaleDetail: any; setSelectedSaleDetail: (v: any) => void;
  currency: string;
  activeTenant: any;
  convertToInvoice: (sale: any) => void;
  handleUpdateSaleERPStatuses: (id: string, updates: any) => void;
  handleRecordNewPayment: (id: string, amt: number, method: string, ref: string) => void;
  handleRefaireFacture: (sale: any) => void;
  handleShareActualFile: () => Promise<void>;
  handleRecordInstallmentPayment: (sale: any, instId: string) => void;
  openReturnModal: (sale: any) => void;
  previewReceiptFormat: string; setPreviewReceiptFormat: (v: any) => void;
  shareModalOpen: boolean; setShareModalOpen: (v: boolean) => void;
  setShareContactValue: (v: string) => void;
  sidebarPayAmount: number; setSidebarPayAmount: (v: number) => void;
  sidebarPayMethod: string; setSidebarPayMethod: (v: string) => void;
  sidebarPayRef: string; setSidebarPayRef: (v: string) => void;
  tenantCustomers: { id: string; name: string; phone: string; }[];
  selectedCustomerId: string;
}

export default function POSHistorique(props: POSHistoriqueProps) {
  const {
    historySearch, setHistorySearch,
    historyFilterStatus, setHistoryFilterStatus,
    filteredHistory,
    activeSaleDetail,
    selectedSaleDetail, setSelectedSaleDetail,
    currency,
    activeTenant,
    convertToInvoice,
    handleUpdateSaleERPStatuses,
    handleRecordNewPayment,
    handleRefaireFacture,
    handleShareActualFile,
    handleRecordInstallmentPayment,
    openReturnModal,
    previewReceiptFormat, setPreviewReceiptFormat,
    setShareModalOpen,
    setShareContactValue,
    sidebarPayAmount, setSidebarPayAmount,
    sidebarPayMethod, setSidebarPayMethod,
    sidebarPayRef, setSidebarPayRef,
  } = props;

  return (
    <motion.div
      key="pos-historique"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Search filter banner */}
      <div className="bg-gray-900 border border-gray-850 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Filtrer l'historique par N° facture ou client..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-850 pl-9 pr-4 py-2 text-xs rounded-xl text-white focus:outline-none"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          {['Tous', 'Payée', 'Partiellement payée', 'En attente', 'Remboursée'].map(status => (
            <button
              key={status}
              onClick={() => setHistoryFilterStatus(status)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                historyFilterStatus === status 
                  ? 'bg-blue-600/15 border border-blue-500/20 text-blue-400' 
                  : 'bg-gray-950 border border-gray-850 text-gray-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Table list of sales */}
        <div className="lg:col-span-7 bg-gray-900 border border-gray-850 rounded-2xl p-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-850 text-gray-500 font-mono font-bold uppercase text-[10px]">
                  <th className="py-3 px-2">Facture</th>
                  <th className="py-3 px-2">Client / Type</th>
                  <th className="py-3 px-2">Total</th>
                  <th className="py-3 px-2">Reglement</th>
                  <th className="py-3 px-2">Statut</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850/40">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-500 italic">
                      Aucune transaction trouvée.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map(sale => {
                    const statusValue = (sale as any).status || 'Payée';
                    const isRet = (sale as any).isReturned;
                    const displayState = getSaleDisplayState(sale);

                    return (
                      <tr key={sale.id} className="hover:bg-gray-850/30 transition">
                        <td className="py-3.5 px-2 font-mono font-bold text-gray-200">
                          {sale.invoiceNumber}
                          <span className="block text-[9px] text-gray-500 font-normal">
                            {new Date(sale.date).toLocaleDateString('fr-FR')} {new Date(sale.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        </td>
                        <td className="py-3.5 px-2">
                          <span className="text-gray-200 font-bold block">{sale.customerName || 'Passager'}</span>
                          <span className="text-[9px] font-mono text-blue-400 uppercase font-bold">
                            {sale.paymentMethod === 'mobile_money' ? 'Mobile Money' : sale.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 font-mono font-black text-white">
                          {sale.total.toLocaleString()} {currency}
                        </td>
                        <td className="py-3.5 px-2">
                          {sale.paymentMethod === 'credit' ? (
                            <div className="text-[10px] font-mono">
                              <span className="text-emerald-400 font-bold">{(sale as any).creditPaidAmount || 0}</span>
                              <span className="text-gray-500"> / {sale.total}</span>
                            </div>
                          ) : (
                            <span className="text-emerald-400 font-mono text-[10px]">Complet</span>
                          )}
                        </td>
                        <td className="py-3.5 px-2">
                          {(() => {
                            const invS = displayState.invoiceStatus;
                            const payS = displayState.paymentStatus;
                            const delivS = displayState.deliveryStatus;
                            const credS = displayState.creditStatus;
                            const globS = displayState.globalStatus;

                            return (
                              <div className="flex flex-col gap-1.5 py-1 min-w-[200px]">
                                <div className="flex flex-wrap gap-1">
                                  <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                    invS === 'Brouillon' ? 'bg-gray-850 text-gray-400 border border-gray-800' :
                                    invS === 'Validée' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                    invS === 'Annulée' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  }`}>
                                    📄 {invS}
                                  </span>

                                  <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                    payS === 'Payé' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    payS === 'Partiellement payé' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    payS === 'Remboursé' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    💰 {payS}
                                  </span>

                                  <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                    delivS === 'Livrée' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    delivS === 'Partiellement livrée' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    delivS === 'Retournée' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    🚚 {delivS}
                                  </span>

                                  {credS !== 'Pas de crédit' && (
                                    <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                      credS === 'Crédit soldé' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                      credS === 'Crédit en retard' ? 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse' :
                                      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                    }`}>
                                      💳 {credS === 'Crédit en retard' ? '⚠️ En retard' : credS}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-gray-400 italic font-mono flex items-center gap-1">
                                  🎯 {globS}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <button
                            onClick={() => setSelectedSaleDetail(sale)}
                            className="bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition"
                          >
                            DÉTAILS
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar detail or formatting receipt generator */}
        <div className="lg:col-span-5 bg-gray-900 border border-gray-850 rounded-2xl p-5 space-y-4">
          {activeSaleDetail ? (() => {
            const selectedSaleDetail = activeSaleDetail;
            return (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-gray-850">
                <div>
                  <h4 className="text-sm font-bold text-white font-mono">{selectedSaleDetail.invoiceNumber}</h4>
                  <span className="text-[10px] text-gray-500 font-mono">Caissier: {selectedSaleDetail.employeeName}</span>
                </div>
                <button
                  onClick={() => setSelectedSaleDetail(null)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Fermer
                </button>
              </div>

              {/* Receipt format selectors */}
              <div className="flex gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-850 text-[10px]">
                {(['58mm', '80mm', 'A4'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setPreviewReceiptFormat(fmt)}
                    className={`flex-1 py-1 rounded-lg font-bold transition-all ${
                      previewReceiptFormat === fmt 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Format {fmt}
                  </button>
                ))}
              </div>

              {/* PREMIUM DOCUMENT LAYOUT RENDER PREVIEW */}
              <div className="bg-white text-gray-900 rounded-2xl p-4.5 font-sans overflow-hidden border border-gray-200 text-xs shadow-2xl relative">
                
                {/* Thermal Receipt Layout */}
                {previewReceiptFormat !== 'A4' ? (
                  <div className={`space-y-3 font-mono leading-tight mx-auto ${previewReceiptFormat === '58mm' ? 'max-w-[220px]' : 'max-w-[320px]'}`}>
                    <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-300">
                      <h5 className="font-extrabold text-sm uppercase tracking-wide">{activeTenant?.name}</h5>
                      <p className="text-[10px] text-gray-600 font-sans">{activeTenant?.address}</p>
                      <p className="text-[10px] text-gray-600 font-sans">Tél: {activeTenant?.phone}</p>
                      <p className="text-[9px] text-gray-500 pt-1">TICKET DE CAISSE NON REÇU FISCAL</p>
                    </div>

                    <div className="space-y-0.5 text-[10px]">
                      <p>Ticket: {selectedSaleDetail.invoiceNumber}</p>
                      <p>Date: {new Date(selectedSaleDetail.date).toLocaleDateString('fr-FR')} {new Date(selectedSaleDetail.date).toLocaleTimeString('fr-FR')}</p>
                      <p>Client: {selectedSaleDetail.customerName}</p>
                      <p>Caissier: {selectedSaleDetail.employeeName}</p>
                      <p className="pt-1 text-[9px] text-gray-700">Règlement: <strong className="uppercase">{selectedSaleDetail.status === 'Payée' || selectedSaleDetail.paymentMethod !== 'credit' ? 'TOTAL (Payé)' : selectedSaleDetail.status === 'Partiellement payée' ? 'PARTIEL' : 'NON PAYÉ'}</strong></p>
                      <p className="text-[9px] text-gray-700">Livraison: <strong className="uppercase">{selectedSaleDetail.deliveryStatus === 'livré' || !selectedSaleDetail.deliveryStatus ? 'LIVRÉ' : 'NON LIVRÉ'}</strong></p>
                    </div>

                    <table className="w-full text-left text-[10px] border-t border-b border-dashed border-gray-300 py-1.5">
                      <thead>
                        <tr className="font-bold">
                          <th>Produit</th>
                          <th className="text-center">Qté</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSaleDetail.items.map((it: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-0.5 truncate max-w-[120px]">{it.productName}</td>
                            <td className="text-center py-0.5">{it.quantity}</td>
                            <td className="text-right py-0.5">{it.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="text-right space-y-0.5 text-[11px] font-bold">
                      <p>Sous-total: {selectedSaleDetail.subtotal.toLocaleString()} {currency}</p>
                      {selectedSaleDetail.discount > 0 && <p className="text-red-600">Remise: -{selectedSaleDetail.discount.toLocaleString()} {currency}</p>}
                      {selectedSaleDetail.extraFees > 0 && <p>{selectedSaleDetail.customFeeLabel || 'Frais extra'}: {selectedSaleDetail.extraFees.toLocaleString()} {currency}</p>}
                      {selectedSaleDetail.deliveryFee > 0 && <p>Livraison: {selectedSaleDetail.deliveryFee.toLocaleString()} {currency}</p>}
                      <p className="text-xs uppercase border-t border-dashed border-gray-300 pt-1 text-black font-black">
                        TOTAL: {selectedSaleDetail.total.toLocaleString()} {currency}
                      </p>
                    </div>

                    <div className="text-center pt-3 border-t border-dashed border-gray-300 space-y-1">
                      <p className="text-[10px] font-bold">MERCI DE VOTRE CONFIANCE !</p>
                      <p className="text-[8px] font-sans text-gray-500">NexaStock POS Multi-tenant ERP</p>
                    </div>
                  </div>
                ) : (
                  /* Official A4 Invoice Layout */
                  <div className="space-y-4 font-sans leading-normal">
                    <div className="flex justify-between items-start pb-4 border-b border-gray-200">
                      <div>
                        <h5 className="font-black text-sm text-blue-900 uppercase">{activeTenant?.name}</h5>
                        <p className="text-[10px] text-gray-600">{activeTenant?.address}</p>
                        <p className="text-[10px] text-gray-600">Tél: {activeTenant?.phone}</p>
                      </div>
                      <div className="text-right">
                        <h6 className="font-bold text-xs text-gray-700">FACTURE OFFICIELLE</h6>
                        <p className="font-mono font-bold text-blue-900">{selectedSaleDetail.invoiceNumber}</p>
                        <p className="text-[10px] text-gray-500">Date: {new Date(selectedSaleDetail.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-[11px] bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Émetteur</span>
                        <p className="font-bold text-gray-800">{activeTenant?.name}</p>
                        <p className="text-gray-600">Responsable: {selectedSaleDetail.employeeName}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Facturé à</span>
                        <p className="font-bold text-gray-800">{selectedSaleDetail.customerName}</p>
                        <p className="text-gray-600">ID Client: {selectedSaleDetail.customerId || 'Anonyme'}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 block uppercase">Suivi & États</span>
                        <div className="mt-1 space-y-1">
                          <p className="text-gray-800 text-[10px]">
                            Règlement : <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                              selectedSaleDetail.status === 'Payée' || selectedSaleDetail.paymentMethod !== 'credit'
                                ? 'bg-emerald-100 text-emerald-800'
                                : selectedSaleDetail.status === 'Partiellement payée'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                            }`}>
                              {selectedSaleDetail.status === 'Payée' || selectedSaleDetail.paymentMethod !== 'credit' ? 'TOTAL (Payé)' : selectedSaleDetail.status === 'Partiellement payée' ? 'PARTIEL' : 'NON PAYÉ'}
                            </span>
                          </p>
                          <p className="text-gray-800 text-[10px]">
                            Livraison : <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                              selectedSaleDetail.deliveryStatus === 'livré' || !selectedSaleDetail.deliveryStatus
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {selectedSaleDetail.deliveryStatus === 'livré' || !selectedSaleDetail.deliveryStatus ? 'LIVRÉ' : 'NON LIVRÉ'}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="bg-gray-100 font-bold text-gray-700">
                          <th className="p-2">Désignation</th>
                          <th className="p-2 text-center">Quantité</th>
                          <th className="p-2 text-right">Prix Unitaire</th>
                          <th className="p-2 text-right">Total HT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150">
                        {selectedSaleDetail.items.map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2 font-bold text-gray-800">{it.productName}</td>
                            <td className="p-2 text-center">{it.quantity}</td>
                            <td className="p-2 text-right">{it.price.toLocaleString()}</td>
                            <td className="p-2 text-right font-bold">{it.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-end pt-2">
                      <div className="w-56 space-y-1.5 text-right font-bold text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-normal">Sous-total HT :</span>
                          <span className="text-gray-800">{selectedSaleDetail.subtotal.toLocaleString()} {currency}</span>
                        </div>
                        {selectedSaleDetail.discount > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span className="font-normal">Remise :</span>
                            <span>-{selectedSaleDetail.discount.toLocaleString()} {currency}</span>
                          </div>
                        )}
                        {selectedSaleDetail.taxRate !== undefined && selectedSaleDetail.taxRate > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 font-normal">TVA ({selectedSaleDetail.taxRate}%) :</span>
                            <span className="text-gray-800">{selectedSaleDetail.tax.toLocaleString()} {currency}</span>
                          </div>
                        )}
                        {selectedSaleDetail.extraFees > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 font-normal">{selectedSaleDetail.customFeeLabel || 'Frais extra'} :</span>
                            <span className="text-gray-800">{selectedSaleDetail.extraFees.toLocaleString()} {currency}</span>
                          </div>
                        )}
                        {selectedSaleDetail.deliveryFee > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 font-normal">Frais de livraison :</span>
                            <span className="text-gray-800">{selectedSaleDetail.deliveryFee.toLocaleString()} {currency}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1.5 border-t border-gray-200 text-xs text-blue-900 font-extrabold">
                          <span>TOTAL TTC :</span>
                          <span>{selectedSaleDetail.total.toLocaleString()} {currency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Payment installment ledger for credit sales */}
              {selectedSaleDetail.paymentMethod === 'credit' && (
                <div className="bg-gray-950 p-4 border border-gray-850 rounded-2xl space-y-3">
                  <h5 className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> CALENDRIER DES ÉCHÉANCES CRÉDITS
                  </h5>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto">
                    {(() => {
                      let instList: any[] = [];
                      try {
                        instList = JSON.parse(selectedSaleDetail.creditInstallments || '[]');
                      } catch(e) {}

                      if (instList.length === 0) {
                        return <p className="text-[10px] text-gray-500 italic">Aucune mensualité configurée.</p>;
                      }

                      return instList.map((inst, idx) => (
                        <div key={inst.id} className="flex justify-between items-center bg-gray-900 border border-gray-850 p-2.5 rounded-xl text-xs font-mono">
                          <div>
                            <p className="text-gray-400">Échéance #{idx + 1} : {inst.dueDate}</p>
                            <p className="text-white font-bold">{inst.amount.toLocaleString()} {currency}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            inst.status === 'Payée' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                          }`}>
                            {inst.status === 'Payée' ? 'Reglée' : (
                              <button
                                onClick={() => handleRecordInstallmentPayment(selectedSaleDetail, inst.id)}
                                className="bg-amber-500 hover:bg-amber-400 text-gray-950 px-2 py-0.5 rounded text-[9px] font-black"
                              >
                                Encaisser
                              </button>
                            )}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* OPTIONS DE GESTION & ÉTATS */}
              <div className="bg-gray-950/40 border border-gray-850 p-4 rounded-2xl space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-850/60">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-blue-400" /> Actions & Suivi de Facturation ERP
                  </span>
                  {selectedSaleDetail.invoiceStatus === 'Annulée' && (
                    <span className="bg-red-500/10 text-red-400 border border-red-500/15 px-2 py-0.5 rounded text-[8.5px] font-bold font-mono uppercase">
                      Facture Annulée
                    </span>
                  )}
                </div>

                {/* STATUT GRID */}
                <div className="grid grid-cols-2 gap-3.5">
                  
                  {/* 1. Facture Status Control */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono text-gray-500 uppercase">1. Facture</span>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                        selectedSaleDetail.invoiceStatus === 'Validée' ? 'bg-emerald-500/15 text-emerald-400' :
                        selectedSaleDetail.invoiceStatus === 'Brouillon' ? 'bg-amber-500/15 text-amber-400' :
                        selectedSaleDetail.invoiceStatus === 'Annulée' ? 'bg-red-500/15 text-red-400' :
                        'bg-gray-500/15 text-gray-400'
                      }`}>
                        {selectedSaleDetail.invoiceStatus || 'Validée'}
                      </span>
                    </div>
                    {selectedSaleDetail.invoiceStatus !== 'Archivée' ? (
                      <select
                        value={selectedSaleDetail.invoiceStatus || 'Validée'}
                        onChange={(e) => {
                          const nextInvoiceStatus = e.target.value as any;
                          if (nextInvoiceStatus === 'Annulée') {
                            const reason = prompt("Veuillez saisir le motif de l'annulation (Obligatoire) :");
                            if (!reason || !reason.trim()) {
                              alert("L'annulation requiert un motif.");
                              return;
                            }
                            handleUpdateSaleERPStatuses(selectedSaleDetail.id, { 
                              invoiceStatus: 'Annulée',
                              abandonReason: reason
                            });
                          } else {
                            handleUpdateSaleERPStatuses(selectedSaleDetail.id, { invoiceStatus: nextInvoiceStatus });
                          }
                        }}
                        className="w-full bg-gray-950 border border-gray-850 text-[11px] rounded-lg px-2 py-1.5 text-white font-mono focus:outline-none focus:border-blue-500"
                      >
                        <option value="Brouillon">Brouillon</option>
                        <option value="Validée">Validée (Confirmée)</option>
                        <option value="Annulée">Annulée (Abandon)</option>
                        <option value="Archivée">Archivée (Lecture Seule)</option>
                      </select>
                    ) : (
                      <div className="w-full bg-gray-950/60 border border-gray-850 text-[10px] text-gray-500 rounded-lg px-2 py-1.5 font-mono italic">
                        Document Archivé (Lecture Seule)
                      </div>
                    )}
                  </div>

                  {/* 2. Livraison Status Control */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono text-gray-500 uppercase">2. Livraison</span>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                        selectedSaleDetail.deliveryStatus === 'Livrée' ? 'bg-emerald-500/15 text-emerald-400' :
                        selectedSaleDetail.deliveryStatus === 'Partiellement livrée' ? 'bg-amber-500/15 text-amber-400' :
                        selectedSaleDetail.deliveryStatus === 'Retournée' ? 'bg-purple-500/15 text-purple-400' :
                        'bg-red-500/15 text-red-400'
                      }`}>
                        {selectedSaleDetail.deliveryStatus || 'Non livrée'}
                      </span>
                    </div>
                    {selectedSaleDetail.invoiceStatus !== 'Archivée' && selectedSaleDetail.invoiceStatus !== 'Annulée' ? (
                      <select
                        value={selectedSaleDetail.deliveryStatus || 'Non livrée'}
                        onChange={(e) => {
                          const nextDeliv = e.target.value as any;
                          handleUpdateSaleERPStatuses(selectedSaleDetail.id, { deliveryStatus: nextDeliv });
                        }}
                        className="w-full bg-gray-950 border border-gray-850 text-[11px] rounded-lg px-2 py-1.5 text-white font-mono focus:outline-none focus:border-blue-500"
                      >
                        <option value="Non livrée">Non livrée</option>
                        <option value="Partiellement livrée">Partiellement livrée</option>
                        <option value="Livrée">Livrée</option>
                        <option value="Retournée">Retournée</option>
                      </select>
                    ) : (
                      <div className="w-full bg-gray-950/60 border border-gray-850 text-[10px] text-gray-500 rounded-lg px-2 py-1.5 font-mono italic">
                        Suivi verrouillé
                      </div>
                    )}
                  </div>

                  {/* 3. Règlement Info Row */}
                  <div className="space-y-1 bg-gray-950 p-2 rounded-xl border border-gray-850/40">
                    <span className="text-[9px] font-mono text-gray-500 uppercase block">3. Règlement</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase block w-fit ${
                      selectedSaleDetail.paymentStatus === 'Payé' ? 'bg-emerald-500/15 text-emerald-400' :
                      selectedSaleDetail.paymentStatus === 'Partiellement payé' ? 'bg-amber-500/15 text-amber-400' :
                      selectedSaleDetail.paymentStatus === 'Remboursé' ? 'bg-purple-500/15 text-purple-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {selectedSaleDetail.paymentStatus || 'Non payé'}
                    </span>
                  </div>

                  {/* 4. Crédit Info Row */}
                  <div className="space-y-1 bg-gray-950 p-2 rounded-xl border border-gray-850/40">
                    <span className="text-[9px] font-mono text-gray-500 uppercase block">4. Suivi Crédit</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase block w-fit ${
                      selectedSaleDetail.creditStatus === 'Crédit soldé' || selectedSaleDetail.creditStatus === 'Pas de crédit' ? 'bg-emerald-500/15 text-emerald-400' :
                      selectedSaleDetail.creditStatus === 'Crédit en retard' ? 'bg-red-500/15 text-red-400 font-black animate-pulse' :
                      'bg-amber-500/15 text-amber-400'
                    }`}>
                      {selectedSaleDetail.creditStatus || 'Pas de crédit'}
                    </span>
                  </div>

                </div>

                {/* Display cancel reason if annulled */}
                {selectedSaleDetail.invoiceStatus === 'Annulée' && selectedSaleDetail.abandonReason && (
                  <div className="bg-red-500/5 border border-red-500/15 p-2.5 rounded-xl text-[11px] text-red-300">
                    <strong>Motif de l'annulation :</strong> {selectedSaleDetail.abandonReason}
                  </div>
                )}

                {/* HISTORIQUE DE PAIEMENT DES ÉCHÉANCES */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center">
                    <h6 className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-wider">
                      💳 Historique des encaissements
                    </h6>
                    <span className="text-[10px] font-mono font-bold text-gray-300">
                      Payé: {((selectedSaleDetail.creditPaidAmount !== undefined) ? selectedSaleDetail.creditPaidAmount : selectedSaleDetail.total).toLocaleString()} / {selectedSaleDetail.total.toLocaleString()} {currency}
                    </span>
                  </div>

                  {(() => {
                    let pList: PaymentHistoryItem[] = [];
                    if (selectedSaleDetail.payments) {
                      pList = typeof selectedSaleDetail.payments === 'string' 
                        ? JSON.parse(selectedSaleDetail.payments) 
                        : selectedSaleDetail.payments;
                    }
                    if (pList.length === 0) {
                      return (
                        <p className="text-[10px] text-gray-500 italic font-mono bg-gray-950 p-2 rounded-xl text-center border border-gray-850/30">
                          Aucun règlement enregistré pour le moment.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 text-[10px] font-mono">
                        {pList.map((p, idx) => (
                          <div key={p.id || idx} className="flex justify-between items-center bg-gray-950/80 p-2 rounded-lg border border-gray-850/50">
                            <div>
                              <span className="text-gray-500">{p.date} {p.time}</span>
                              <p className="text-white font-bold leading-none">{p.amount.toLocaleString()} {currency} <span className="text-[9px] font-normal text-gray-400">({p.paymentMethod})</span></p>
                              <p className="text-gray-400 text-[9px] mt-0.5 truncate max-w-[180px]">{p.reference}</p>
                            </div>
                            <span className="text-gray-500 text-[8px] italic">{p.userName || 'Caissier'}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ENREGISTRER UN RÈGLEMENT (IF NOT FULLY PAID & NOT CANCELLED) */}
                {selectedSaleDetail.invoiceStatus !== 'Annulée' && selectedSaleDetail.invoiceStatus !== 'Archivée' && (() => {
                  const paidSoFar = (selectedSaleDetail.creditPaidAmount !== undefined) ? selectedSaleDetail.creditPaidAmount : selectedSaleDetail.total;
                  const dueRemaining = Math.max(0, selectedSaleDetail.total - paidSoFar);
                  if (dueRemaining <= 0) return null;

                  return (
                    <div className="bg-amber-600/5 border border-amber-500/20 p-3 rounded-xl space-y-2.5">
                      <h6 className="text-[10px] font-bold font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1">
                        ➕ Enregistrer un Règlement Financier
                      </h6>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] text-gray-500 uppercase font-mono block mb-0.5">Montant ({currency})</label>
                          <input
                            type="number"
                            min={1}
                            max={dueRemaining}
                            value={sidebarPayAmount || ''}
                            placeholder={`${dueRemaining}`}
                            onChange={(e) => setSidebarPayAmount(Math.max(0, Math.min(dueRemaining, Number(e.target.value))))}
                            className="w-full bg-gray-950 border border-gray-850 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-gray-500 uppercase font-mono block mb-0.5">Moyen</label>
                          <select
                            value={sidebarPayMethod}
                            onChange={(e) => setSidebarPayMethod(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-850 rounded-lg px-2 py-1 text-xs text-white font-mono"
                          >
                            <option value="especes">Espèces</option>
                            <option value="mobile_money">Mobile Money</option>
                            <option value="carte">Carte Bancaire</option>
                            <option value="virement">Virement</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] text-gray-500 uppercase font-mono block mb-0.5">Référence / Numéro Transaction</label>
                        <input
                          type="text"
                          placeholder="ex: Orange Money Ref #1234..."
                          value={sidebarPayRef}
                          onChange={(e) => setSidebarPayRef(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-850 rounded-lg px-2 py-1 text-xs text-white font-mono placeholder-gray-700"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const payAmt = sidebarPayAmount || dueRemaining;
                          if (payAmt <= 0) return;
                          handleRecordNewPayment(selectedSaleDetail.id, payAmt, sidebarPayMethod, sidebarPayRef || `Règlement partiel - ${selectedSaleDetail.invoiceNumber}`);
                          setSidebarPayAmount(0);
                          setSidebarPayRef('');
                          alert(`Règlement de ${payAmt.toLocaleString()} ${currency} enregistré !`);
                        }}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold py-1.5 text-[10px] rounded-lg transition uppercase tracking-wider font-mono"
                      >
                        Confirmer le règlement ({sidebarPayAmount ? sidebarPayAmount.toLocaleString() : dueRemaining.toLocaleString()} {currency})
                      </button>
                    </div>
                  );
                })()}

                {/* Refaire la Facture option */}
                <button
                  type="button"
                  onClick={() => handleRefaireFacture(selectedSaleDetail)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Refaire / Modifier cette facture (Nouveau panier)
                </button>
              </div>

              {/* Operational Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                {selectedSaleDetail.saleType !== 'facture' && (
                  <button
                    onClick={() => convertToInvoice(selectedSaleDetail)}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <FileCheck className="w-4 h-4" /> Transformer en Facture
                  </button>
                )}

                <button
                  onClick={() => openReturnModal(selectedSaleDetail)}
                  className="w-full bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/15 font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Retour de Vente / Avoir
                </button>

                <button
                  onClick={() => window.print()}
                  className="w-full bg-gray-950 border border-gray-850 hover:bg-gray-850 text-gray-300 font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Imprimer Physique
                </button>

                <button
                  onClick={() => {
                    setShareContactValue(selectedSaleDetail.customerName === 'Vente Comptoir' ? '' : 'Client');
                    setShareModalOpen(true);
                  }}
                  className="w-full bg-gray-950 border border-gray-850 hover:bg-gray-850 text-gray-300 font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Send className="w-4 h-4" /> Partager Numérique
                </button>
              </div>
            </div>
            );
          })() : (
            <div className="text-center py-24 space-y-3.5">
              <FileText className="w-14 h-14 text-gray-800 mx-auto" />
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sélectionnez une facture</p>
                <p className="text-[11px] text-gray-500 leading-normal max-w-xs mx-auto">
                  Cliquez sur le bouton "DÉTAILS" de l'une des ventes de l'historique de gauche pour l'éditer, imprimer un reçu thermique 80mm/58mm, l'exporter au format A4, ou procéder à un retour de marchandises.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
