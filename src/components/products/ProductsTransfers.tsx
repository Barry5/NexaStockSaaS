import { motion } from 'motion/react';
import { ArrowLeftRight, CheckCircle, Plus } from 'lucide-react';
import type { StockTransfer, Warehouse, Product } from '../../types';

interface ProductsTransfersProps {
  key?: string | null;
  tenantTransfers: StockTransfer[];
  tenantWarehouses: Warehouse[];
  tenantProducts: Product[];
  onCreateTransfer: () => void;
}

export default function ProductsTransfers({ tenantTransfers, tenantWarehouses, tenantProducts, onCreateTransfer }: ProductsTransfersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-4"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Logistique & Transferts Inter-Boutiques</h3>
        <button
          onClick={onCreateTransfer}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 transition text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> Initier un Transfert
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-850 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-850">
            <tr>
              <th className="p-3">Réf Transfert</th>
              <th className="p-3">Produit concerné</th>
              <th className="p-3">Provenance (Départ)</th>
              <th className="p-3">Destination (Arrivée)</th>
              <th className="p-3">Quantité Transférée</th>
              <th className="p-3">Date</th>
              <th className="p-3">État Logistique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-850">
            {tenantTransfers.length > 0 ? (
              tenantTransfers.map(tr => {
                const fromWh = tenantWarehouses.find(w => w.id === tr.fromWarehouseId);
                const toWh = tenantWarehouses.find(w => w.id === tr.toWarehouseId);

                return (
                  <tr key={tr.id} className="hover:bg-gray-950/20 transition">
                    <td className="p-3 font-mono text-gray-400 text-[10px]">{tr.id}</td>
                    <td className="p-3 font-semibold text-white">{tr.productName}</td>
                    <td className="p-3 text-gray-300 font-medium">
                      {fromWh ? fromWh.name : tr.fromWarehouseId}
                    </td>
                    <td className="p-3 text-emerald-400 font-medium">
                      {toWh ? toWh.name : tr.toWarehouseId}
                    </td>
                    <td className="p-3 font-mono text-white font-bold">{tr.quantity} unités</td>
                    <td className="p-3 font-mono text-gray-400">{tr.date}</td>
                    <td className="p-3">
                      <span className="text-[9px] font-bold uppercase bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1 w-max">
                        <CheckCircle className="w-3 h-3" /> Terminé
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="text-center p-8 text-gray-500 italic">
                  Aucun mouvement de stock inter-entrepôt enregistré pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
