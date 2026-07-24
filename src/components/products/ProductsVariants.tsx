import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import type { ProductVariant, Product } from '../../types';

interface ProductsVariantsProps {
  key?: string | null;
  tenantVariants: ProductVariant[];
  tenantProducts: Product[];
  onCreateVariant: () => void;
}

export default function ProductsVariants({ tenantVariants, tenantProducts, onCreateVariant }: ProductsVariantsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-4"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Variantes de Produits (Attributs, Couleurs, Tailles)</h3>
        <button
          onClick={onCreateVariant}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 transition text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
        >
          <Plus className="w-3.5 h-3.5" /> Nouvelle Variante
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-850 rounded-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-850">
            <tr>
              <th className="p-3">ID Variante</th>
              <th className="p-3">Produit Parent</th>
              <th className="p-3">Nom Variante (ex: Taille: XL)</th>
              <th className="p-3">SKU Variante</th>
              <th className="p-3">Quantité en Stock</th>
              <th className="p-3">Delta de Prix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-850">
            {tenantVariants.length > 0 ? (
              tenantVariants.map(vr => {
                const parent = tenantProducts.find(p => p.id === vr.productId);
                return (
                  <tr key={vr.id} className="hover:bg-gray-950/20 transition">
                    <td className="p-3 font-mono text-gray-500 text-[10px]">{vr.id}</td>
                    <td className="p-3 font-semibold text-gray-300">
                      {parent ? parent.name : vr.productId}
                    </td>
                    <td className="p-3 text-white font-bold">{vr.name}</td>
                    <td className="p-3 font-mono text-gray-400">{vr.sku}</td>
                    <td className="p-3 font-mono text-white font-bold">{vr.quantity} u.</td>
                    <td className="p-3 font-mono text-emerald-400 font-semibold">
                      {vr.priceDelta >= 0 ? `+${vr.priceDelta}` : vr.priceDelta} €
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center p-8 text-gray-500 italic">
                  Aucune variante d'attribut créée pour vos produits.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
