import { type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product, Warehouse } from '../../types';

interface TransferFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  tenantProducts: Product[];
  tenantWarehouses: Warehouse[];
  selectedProductId: string;
  setSelectedProductId: (v: string) => void;
  fromWarehouseId: string;
  setFromWarehouseId: (v: string) => void;
  toWarehouseId: string;
  setToWarehouseId: (v: string) => void;
  transferQty: number;
  setTransferQty: (v: number) => void;
}

export default function TransferFormModal({
  isOpen,
  onClose,
  onSave,
  tenantProducts,
  tenantWarehouses,
  selectedProductId,
  setSelectedProductId,
  fromWarehouseId,
  setFromWarehouseId,
  toWarehouseId,
  setToWarehouseId,
  transferQty,
  setTransferQty
}: TransferFormModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-900 border border-gray-850 p-6 rounded-2xl max-w-md w-full"
          >
            <h3 className="text-base font-bold font-display text-white mb-4">Initier un Transfert Logistique Inter-Entrepôt</h3>

            <form onSubmit={onSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Produit à Transférer</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                >
                  <option value="">-- Choisir un produit --</option>
                  {tenantProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.quantity} en stock)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">De (Départ)</label>
                  <select
                    required
                    value={fromWarehouseId}
                    onChange={(e) => setFromWarehouseId(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choisir --</option>
                    {tenantWarehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">À (Arrivée)</label>
                  <select
                    required
                    value={toWarehouseId}
                    onChange={(e) => setToWarehouseId(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choisir --</option>
                    {tenantWarehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Quantité à Transférer</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-950 text-gray-400 hover:text-white rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs"
                >
                  Lancer le Transfert
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
