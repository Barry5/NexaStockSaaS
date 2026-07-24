import { motion, AnimatePresence } from 'motion/react';
import { Barcode } from 'lucide-react';
import type { Product } from '../../types';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantProducts: Product[];
  onScan: (barcode: string) => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  tenantProducts,
  onScan
}: BarcodeScannerModalProps) {
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
            <h3 className="text-base font-bold font-display text-white mb-2 flex items-center gap-2">
              <Barcode className="w-5 h-5 text-blue-500" />
              Simulateur de Code-barres
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Cliquez sur un article ci-dessous pour simuler un scan physique sur le terminal de point de vente.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {tenantProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => onScan(p.barcode)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg bg-gray-950 hover:bg-gray-850 border border-gray-800 hover:border-gray-700 transition text-left"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-6 h-6 rounded bg-gray-800 font-mono flex items-center justify-center font-bold text-gray-400 text-[10px]">
                      {p.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-300">{p.name}</p>
                      <p className="text-[10px] text-gray-500 font-mono font-bold">Code: {p.barcode}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/10 font-bold">Simuler</span>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-850 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 transition text-gray-300 text-xs rounded-xl"
              >
                Fermer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
