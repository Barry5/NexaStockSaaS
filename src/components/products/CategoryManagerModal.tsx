import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, Trash2 } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  tenantCategories: string[];
  onAddCustomCategory: (name: string) => void;
  onRemoveCustomCategory: (name: string) => void;
}

export default function CategoryManagerModal({
  isOpen,
  onClose,
  categories,
  tenantCategories,
  onAddCustomCategory,
  onRemoveCustomCategory
}: CategoryManagerModalProps) {
  const [newCategoryName, setNewCategoryName] = useState('');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-900 border border-gray-850 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400 font-mono">Gérer les Catégories</h3>
                <p className="text-xs text-gray-400">Ajouter ou supprimer des catégories personnalisées pour votre boutique.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400">Nouvelle Catégorie</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="ex: Accessoires de Luxe"
                  className="flex-1 bg-gray-950 border border-gray-800 text-xs text-white rounded-xl px-3.5 py-2.5 outline-none focus:border-purple-500 transition font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onAddCustomCategory(newCategoryName);
                      setNewCategoryName('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onAddCustomCategory(newCategoryName);
                    setNewCategoryName('');
                  }}
                  className="bg-purple-600 hover:bg-purple-500 transition text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-md shadow-purple-500/10"
                >
                  Ajouter
                </button>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-mono font-bold text-gray-500 uppercase">Catégories Actuelles</label>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-850/50">
                {categories.filter(c => c !== 'Tous').length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-3 text-center">Aucune catégorie personnalisée.</p>
                ) : (
                  categories.filter(c => c !== 'Tous').map(cat => {
                    const isCustom = tenantCategories.includes(cat);
                    return (
                      <div key={cat} className="flex justify-between items-center py-2 text-xs first:pt-0">
                        <span className="text-gray-200 font-semibold flex items-center gap-1.5">
                          <Tag className="w-3 h-3 text-purple-400" /> {cat}
                          {!isCustom && (
                            <span className="text-[9px] bg-gray-850 text-gray-500 px-1.5 py-0.2 rounded font-mono">Système</span>
                          )}
                        </span>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => onRemoveCustomCategory(cat)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 rounded transition"
                            title="Supprimer la catégorie"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-850 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-750 transition text-gray-300 text-xs rounded-xl font-semibold"
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
