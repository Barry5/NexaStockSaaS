import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';

interface POSReturnModalProps {
  isReturnModalOpen: boolean;
  selectedSaleDetail: any;
  returnQtys: Record<string, number>;
  setReturnQtys: (v: Record<string, number>) => void;
  returnReason: string; setReturnReason: (v: string) => void;
  refundAmountInput: number; setRefundAmountInput: (v: number) => void;
  handleReturnSubmit: () => void;
  setIsReturnModalOpen: (v: boolean) => void;
  currency: string;
}

export default function POSReturnModal(props: POSReturnModalProps) {
  const {
    isReturnModalOpen,
    selectedSaleDetail,
    returnQtys, setReturnQtys,
    returnReason, setReturnReason,
    refundAmountInput, setRefundAmountInput,
    handleReturnSubmit,
    setIsReturnModalOpen,
    currency,
  } = props;

  if (!isReturnModalOpen || !selectedSaleDetail) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-gray-900 border border-gray-850 p-6 rounded-2xl shadow-2xl space-y-4"
      >
        <div className="flex justify-between items-center pb-2 border-b border-gray-850">
          <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-red-500" /> RETOUR PRODUITS & AVOIR
          </h4>
          <button onClick={() => setIsReturnModalOpen(false)} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <p className="text-[11px] text-gray-400">
          Sélectionnez les quantités à retourner. Celles-ci seront réintégrées en stock et le montant total de la facture {selectedSaleDetail.invoiceNumber} sera ajusté.
        </p>

        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
          {selectedSaleDetail.items.map((it: any) => (
            <div key={it.productId} className="bg-gray-950 border border-gray-850 p-2.5 rounded-xl space-y-1.5">
              <p className="text-xs font-bold text-gray-200">{it.productName}</p>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-gray-500">Acheté : x{it.quantity}</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 mr-2">Retourner :</span>
                  <input
                    type="number"
                    min={0}
                    max={it.quantity}
                    value={returnQtys[it.productId] || 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(it.quantity, Number(e.target.value)));
                      setReturnQtys({
                        ...returnQtys,
                        [it.productId]: val
                      });
                    }}
                    className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-xs text-white font-bold font-mono w-14 text-center"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Motif & Remboursement addition */}
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-gray-500 uppercase block">Motif du Retour :</label>
            <input
              type="text"
              placeholder="ex: Produit défectueux, Erreur taille..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono text-gray-500 uppercase block">Montant Remboursé ({currency}) :</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={refundAmountInput || ''}
              onChange={(e) => setRefundAmountInput(Math.max(0, Number(e.target.value)))}
              className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-red-500 font-mono font-bold"
            />
            <p className="text-[9px] text-gray-500 italic">Si le montant remboursé est égal au total, la facture sera marquée "Remboursée".</p>
          </div>
        </div>

        <div className="flex gap-2 pt-2 text-xs">
          <button
            onClick={() => setIsReturnModalOpen(false)}
            className="flex-1 bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 font-bold py-2 rounded-xl transition"
          >
            Annuler
          </button>
          <button
            onClick={handleReturnSubmit}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-xl transition shadow-lg shadow-red-500/10"
          >
            Valider le Retour
          </button>
        </div>
      </motion.div>
    </div>
  );
}
