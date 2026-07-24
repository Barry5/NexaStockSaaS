import { motion } from 'motion/react';
import { Plus, Search, Package, AlertTriangle, Barcode, Edit, Trash2, Tag } from 'lucide-react';
import type { Product } from '../../types';
import { filterProducts, formatCurrency, getProductStockState } from '../../services/productCatalog';

interface ProductsCatalogProps {
  key?: string | null;
  tenantProducts: Product[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  filterAlerts: boolean;
  setFilterAlerts: (v: boolean) => void;
  categories: string[];
  planName: string;
  productCount: number;
  productLimit: number | null;
  currency: string;
  onOpenCreate: () => void;
  onOpenEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onOpenBarcodeScanner: () => void;
  onOpenCategoryManager: () => void;
  scannedCode: string;
}

export default function ProductsCatalog({
  tenantProducts,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  filterAlerts,
  setFilterAlerts,
  categories,
  planName,
  productCount,
  productLimit,
  currency,
  onOpenCreate,
  onOpenEdit,
  onDelete,
  onOpenBarcodeScanner,
  onOpenCategoryManager,
  scannedCode
}: ProductsCatalogProps) {
  const isLimitReached = productLimit !== null && productCount >= productLimit;
  const alertCount = tenantProducts.filter(p => p.quantity <= p.alertThreshold).length;
  const filteredProducts = filterProducts(tenantProducts, searchTerm, selectedCategory, filterAlerts);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-4"
    >
      <div className="flex gap-2 justify-end">
        <button
          onClick={onOpenCategoryManager}
          className="flex items-center gap-1.5 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/25 transition px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-sm"
        >
          <Tag className="w-3.5 h-3.5 text-purple-400" /> Gérer Catégories
        </button>

        <button
          onClick={onOpenBarcodeScanner}
          className="flex items-center gap-1.5 bg-gray-850 border border-gray-700 text-gray-200 hover:bg-gray-800 transition px-3.5 py-1.5 rounded-xl text-xs font-semibold"
        >
          <Barcode className="w-4 h-4 text-blue-400" /> Scanner
        </button>

        {planName && (
          <div className="hidden sm:flex flex-col items-end justify-center px-1 text-right mr-1">
            <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">Forfait {planName}</span>
            <span className={`text-[11px] font-bold font-mono ${isLimitReached ? 'text-red-400' : 'text-blue-400'}`}>
              {productCount} / {productLimit} Prod
            </span>
          </div>
        )}

        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 transition text-white px-4 py-1.5 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15"
        >
          <Plus className="w-4 h-4" /> Nouveau Produit
        </button>
      </div>

      {scannedCode && (
        <div className="bg-blue-950/40 border border-blue-500/20 text-blue-200 p-3 rounded-xl flex items-center justify-between text-xs">
          <span className="flex items-center gap-2">
            <Barcode className="w-4 h-4 text-blue-400" />
            Code-barres détecté : <strong className="text-white">{scannedCode}</strong> (Filtre appliqué)
          </span>
          <button onClick={() => setSearchTerm('')} className="text-blue-400 hover:underline">Réinitialiser</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-900 border border-gray-850 p-4 rounded-2xl">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher par nom, SKU ou code-barres..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-xs text-white rounded-xl pl-10 pr-4 py-2 outline-none transition"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-xs text-white rounded-xl px-3.5 py-2 outline-none transition"
          >
            <option value="Tous">Toutes Catégories</option>
            {categories.filter(c => c !== 'Tous').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-gray-300">
            <input
              type="checkbox"
              checked={filterAlerts}
              onChange={(e) => setFilterAlerts(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white relative"></div>
            <span>Alertes de Rupture ({alertCount})</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(prod => {
            const stockState = getProductStockState(prod);
            const isLow = stockState === 'low';
            const isOut = stockState === 'out';

            return (
              <div
                key={prod.id}
                className={`bg-gray-900 border ${
                  isOut ? 'border-red-500/30 bg-red-950/5' : isLow ? 'border-amber-500/20' : 'border-gray-850 hover:border-gray-700'
                } rounded-2xl overflow-hidden flex flex-col justify-between transition group relative`}
              >
                {isOut ? (
                  <span className="absolute top-3 left-3 z-10 bg-red-600 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Rupture Stock
                  </span>
                ) : isLow ? (
                  <span className="absolute top-3 left-3 z-10 bg-amber-500 text-gray-900 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Bas Stock
                  </span>
                ) : null}

                <div className="h-44 bg-gray-950 relative overflow-hidden flex items-center justify-center border-b border-gray-850">
                  {prod.image ? (
                    <img
                      src={prod.image}
                      alt={prod.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Package className="w-12 h-12 text-gray-800" />
                  )}
                  <span className="absolute bottom-3 left-3 bg-gray-900/90 text-[10px] text-gray-300 px-2 py-0.5 rounded-md border border-gray-800">
                    {prod.category}
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-100 group-hover:text-white transition leading-tight line-clamp-1">{prod.name}</h3>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5 flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5 text-gray-600" /> {prod.barcode}
                    </p>
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2 min-h-[2rem]">
                      {prod.description || 'Aucune description fournie pour cet article.'}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-850 flex justify-between items-end">
                    <div>
                      <span className="text-[9px] text-gray-500 block uppercase font-mono">Prix Vente</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">{formatCurrency(prod.sellPrice, currency)}</span>
                      <span className="text-[9px] text-gray-500 block font-mono mt-0.5">Achat: {formatCurrency(prod.buyPrice, currency)}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] text-gray-500 block uppercase font-mono">Disponibilité</span>
                      <span className={`text-sm font-mono font-bold ${
                        isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-white'
                      }`}>
                        {prod.quantity} <span className="text-[10px] font-sans font-normal text-gray-400 font-bold">u.</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-950 px-4 py-2.5 flex justify-between items-center border-t border-gray-850">
                  <span className="text-[9px] text-gray-500 font-mono">SKU: {prod.sku}</span>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onOpenEdit(prod)}
                      className="p-1.5 bg-gray-900 hover:bg-gray-850 rounded-lg text-gray-400 hover:text-white transition"
                      title="Modifier l'article"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(prod.id)}
                      className="p-1.5 bg-gray-900 hover:bg-red-950 hover:text-red-400 rounded-lg text-gray-500 transition"
                      title="Supprimer l'article"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-16 text-center bg-gray-900/40 border border-gray-850 rounded-2xl">
            <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-400">Aucun produit ne correspond à vos filtres</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
