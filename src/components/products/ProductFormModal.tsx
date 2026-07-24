import { type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import type { Product } from '../../types';

const IMAGE_PRESETS = [
  { label: 'Smartphone', url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200&h=200&fit=crop&q=80' },
  { label: 'Laptop', url: 'https://images.unsplash.com/photo-1496181130204-755241544e35?w=200&h=200&fit=crop&q=80' },
  { label: 'Casque', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&h=200&fit=crop&q=80' },
  { label: 'Écouteurs', url: 'https://images.unsplash.com/photo-1588449668338-d1516824347d?w=200&h=200&fit=crop&q=80' },
  { label: 'Boîte Médicament', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&h=200&fit=crop&q=80' },
  { label: 'Crème Cosmetique', url: 'https://images.unsplash.com/photo-1608248597481-496100c8c836?w=200&h=200&fit=crop&q=80' },
  { label: 'Bouteille Jus', url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=200&fit=crop&q=80' },
  { label: 'Snack / Chocolat', url: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=200&h=200&fit=crop&q=80' }
];

export { IMAGE_PRESETS };

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => void;
  editingProduct: Product | null;
  formData: { name: string; sku: string; barcode: string; description: string; category: string; buyPrice: number; sellPrice: number; quantity: number; alertThreshold: number; image: string };
  setFormData: (data: any) => void;
  categories: string[];
  onAddCustomCategory: (name: string) => void;
  currency: string;
  errors?: Record<string, string>;
  onClearError?: (field: string) => void;
}

function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">{label}</label>
      {children}
      {error && (
        <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-0.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

export default function ProductFormModal({
  isOpen,
  onClose,
  onSave,
  editingProduct,
  formData,
  setFormData,
  categories,
  currency,
  errors = {},
  onClearError,
}: ProductFormModalProps) {
  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
    onClearError?.(field);
  };

  const handleImageFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 2 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) updateField('image', ev.target.result as string);
      };
      reader.readAsDataURL(file);
    } else if (file) {
      alert("L'image ne doit pas dépasser 2 Mo.");
    }
  };

  const inputClass = (field: string) =>
    `w-full bg-gray-950 border rounded-xl px-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition ${errors[field] ? 'border-red-500' : 'border-gray-800 focus:border-blue-500'}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-gray-900 border border-gray-850 p-6 rounded-2xl max-w-2xl w-full my-8"
          >
            <div className="flex justify-between items-center pb-4 border-b border-gray-850">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {editingProduct ? 'Modifier la Fiche Article' : 'Créer un Nouveau Produit'}
              </h3>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none p-1">&times;</button>
            </div>

            <form onSubmit={onSave} className="space-y-4 pt-4" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Nom du Produit *" error={errors.name}>
                  <input type="text" required value={formData.name} onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Ex: iPhone 15 Pro Max" className={inputClass('name')} />
                </FormField>

                <div className="grid grid-cols-2 gap-2">
                  <FormField label="UGS (SKU) *" error={errors.sku}>
                    <input type="text" required value={formData.sku} onChange={(e) => updateField('sku', e.target.value)}
                      placeholder="SKU-001" className={inputClass('sku')} />
                  </FormField>

                  <FormField label="Code-barres" error={errors.barcode}>
                    <input type="text" value={formData.barcode} onChange={(e) => updateField('barcode', e.target.value)}
                      placeholder="Optionnel" className={inputClass('barcode')} />
                  </FormField>
                </div>

                <FormField label="Catégorie *" error={errors.category}>
                  <input type="text" list="cat-list" required value={formData.category} onChange={(e) => updateField('category', e.target.value)}
                    placeholder="Ex: Téléphones" className={inputClass('category')} />
                  <datalist id="cat-list">
                    {categories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>
                </FormField>

                <FormField label="Description" error={errors.description}>
                  <input type="text" value={formData.description} onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Brève description" className={inputClass('description')} />
                </FormField>

                <FormField label="Prix d'Achat" error={errors.buyPrice}>
                  <input type="number" step="0.01" min="0" value={formData.buyPrice} onChange={(e) => updateField('buyPrice', Number(e.target.value))}
                    placeholder="0" className={inputClass('buyPrice')} />
                </FormField>

                <FormField label="Prix de Vente" error={errors.sellPrice}>
                  <input type="number" step="0.01" min="0" value={formData.sellPrice} onChange={(e) => updateField('sellPrice', Number(e.target.value))}
                    placeholder="0" className={inputClass('sellPrice')} />
                </FormField>

                <FormField label="Quantité en Stock" error={errors.quantity}>
                  <input type="number" min="0" value={formData.quantity} onChange={(e) => updateField('quantity', Number(e.target.value))}
                    placeholder="0" className={inputClass('quantity')} />
                </FormField>

                <FormField label="Seuil d'Alerte" error={errors.alertThreshold}>
                  <input type="number" min="0" value={formData.alertThreshold} onChange={(e) => updateField('alertThreshold', Number(e.target.value))}
                    placeholder="5" className={inputClass('alertThreshold')} />
                </FormField>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-gray-400 uppercase block">Photo du Produit</label>
                {formData.image && (
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-gray-800">
                    <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <input type="file" accept="image/*" onChange={handleImageFile}
                    className="text-[10px] text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700" />
                  <input type="text" value={formData.image} onChange={(e) => updateField('image', e.target.value)}
                    placeholder="Ou collez une URL d'image..." className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {IMAGE_PRESETS.map(p => (
                    <button key={p.label} type="button" onClick={() => updateField('image', p.url)}
                      className="relative group overflow-hidden rounded-lg border border-gray-800 hover:border-blue-500 transition">
                      <img src={p.url} alt={p.label} className="w-full h-10 object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <span className="text-[7px] text-white opacity-0 group-hover:opacity-100 font-bold">{p.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-850">
                <button type="button" onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-2 rounded-xl text-xs transition">Annuler</button>
                <button type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-blue-500/15">
                  {editingProduct ? 'Sauvegarder l\'Article' : 'Créer le Produit'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
