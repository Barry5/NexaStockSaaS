import { motion } from 'motion/react';
import { Plus, MapPin } from 'lucide-react';
import type { Warehouse } from '../../types';

interface ProductsWarehousesProps {
  key?: string | null;
  tenantWarehouses: Warehouse[];
  organizationName: string;
  onCreateWarehouse: () => void;
}

export default function ProductsWarehouses({ tenantWarehouses, organizationName, onCreateWarehouse }: ProductsWarehousesProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-4"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Lieux de Stockage & Boutiques</h3>
        <button
          onClick={onCreateWarehouse}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 transition text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
        >
          <Plus className="w-3.5 h-3.5" /> Nouvel Entrepôt
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tenantWarehouses.length > 0 ? (
          tenantWarehouses.map(wh => (
            <div key={wh.id} className="bg-gray-900 border border-gray-850 p-5 rounded-2xl space-y-4 relative overflow-hidden group hover:border-gray-700 transition">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center text-blue-400">
                <MapPin className="w-5 h-5" />
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-200">{wh.name}</h4>
                <p className="text-xs text-gray-400">{wh.location || 'Pas de localisation définie'}</p>
              </div>

              <div className="border-t border-gray-850 pt-3 flex justify-between items-center text-[10px] text-gray-500 font-mono">
                <span>ORGANISATION</span>
                <span className="font-bold text-gray-400 uppercase">{organizationName}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center bg-gray-900/30 border border-gray-850 rounded-2xl">
            <MapPin className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Aucun entrepôt de stockage n'a encore été créé pour cette organisation.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
