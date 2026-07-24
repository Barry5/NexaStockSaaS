import { type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface WarehouseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  warehouseName: string;
  setWarehouseName: (v: string) => void;
  warehouseLocation: string;
  setWarehouseLocation: (v: string) => void;
}

export default function WarehouseFormModal({
  isOpen,
  onClose,
  onSave,
  warehouseName,
  setWarehouseName,
  warehouseLocation,
  setWarehouseLocation
}: WarehouseFormModalProps) {
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
            <h3 className="text-base font-bold font-display text-white mb-4">Créer un Nouveau Lieu de Stockage</h3>

            <form onSubmit={onSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Nom de l'Entrepôt / Boutique</label>
                <input
                  type="text"
                  required
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  placeholder="Ex: Entrepôt Nord-Paris ou Boutique Lyon"
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Adresse / Localisation</label>
                <input
                  type="text"
                  required
                  value={warehouseLocation}
                  onChange={(e) => setWarehouseLocation(e.target.value)}
                  placeholder="Ex: 45 Rue de la Logistique, Paris"
                  className="w-full bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3 py-2 outline-none focus:border-blue-500 transition"
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
                  Créer l'Entrepôt
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
