import { type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Product } from '../../types';

interface VariantFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  tenantProducts: Product[];
  variantProductId: string;
  setVariantProductId: (v: string) => void;
  variantName: string;
  setVariantName: (v: string) => void;
  variantSku: string;
  setVariantSku: (v: string) => void;
  variantQty: number;
  setVariantQty: (v: number) => void;
  priceDelta: number;
  setPriceDelta: (v: number) => void;
}

export default function VariantFormModal({
  isOpen,
  onClose,
  onSave,
  tenantProducts,
  variantProductId,
  setVariantProductId,
  variantName,
  setVariantName,
  variantSku,
  setVariantSku,
  variantQty,
  setVariantQty,
  priceDelta,
  setPriceDelta
}: VariantFormModalProps) {
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
            <h3 className="text-base font-bold font-display text-white mb-4">Créer une Variante d'Attribut</h3>

            <form onSubmit={onSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Produit Parent</label>
                <select
                  required
                  value={variantProductId}
                  onChange={(e) => setVariantProductId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                >
                  <option value="">-- Choisir un produit parent --</option>
                  {tenantProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Nom de la Variante (Attribut)</label>
                <input
                  type="text"
                  required
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="Ex: Couleur: Titane Naturel ou Taille: XL"
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">SKU Variante</label>
                  <input
                    type="text"
                    value={variantSku}
                    onChange={(e) => setVariantSku(e.target.value)}
                    placeholder="Ex: IPH15-NAT-XL"
                    className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Stock Quantité</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={variantQty}
                    onChange={(e) => setVariantQty(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Ajustement de Prix (€)</label>
                <input
                  type="number"
                  step="any"
                  value={priceDelta}
                  onChange={(e) => setPriceDelta(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition font-mono"
                />
                <span className="text-[9px] text-gray-500 block">Saisissez une valeur positive (ex: +20) pour augmenter le prix final ou négative pour le réduire.</span>
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
                  Créer la Variante
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
