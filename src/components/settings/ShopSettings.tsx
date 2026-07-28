import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building,
  Check,
  Coins,
  Save,
  Trash2,
  Upload
} from 'lucide-react';

interface ShopSettingsProps {
  activeTenant: any;
  shopName: string;
  setShopName: (v: string) => void;
  shopDescription: string;
  setShopDescription: (v: string) => void;
  shopCurrency: string;
  setShopCurrency: (v: string) => void;
  shopTaxRate: number | string;
  setShopTaxRate: (v: any) => void;
  shopAddress: string;
  setShopAddress: (v: string) => void;
  shopPhone: string;
  setShopPhone: (v: string) => void;
  shopLogo: string;
  setShopLogo: (v: string) => void;
  isSaved: boolean;
  saveLoading: boolean;
  handleSaveSettings: (e: React.FormEvent) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatSample: (val: number, currCode: string) => string;
}

export default function ShopSettings({
  activeTenant,
  shopName, setShopName,
  shopDescription, setShopDescription,
  shopCurrency, setShopCurrency,
  shopTaxRate, setShopTaxRate,
  shopAddress, setShopAddress,
  shopPhone, setShopPhone,
  shopLogo, setShopLogo,
  isSaved,
  saveLoading,
  handleSaveSettings,
  handleLogoUpload,
  formatSample,
}: ShopSettingsProps) {
  return (
    <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
      <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600/15 border border-blue-500/25 rounded-xl flex items-center justify-center text-blue-400">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Configuration de la Boutique : <span className="text-blue-400 font-sans">{activeTenant?.name}</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Personnalisez l'identité de l'établissement, l'adresse de facturation, la taxe TVA et la devise active.</p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-1 rounded-lg uppercase self-start sm:self-auto">
          Plan {activeTenant?.plan}
        </span>
      </div>

      <form onSubmit={handleSaveSettings} className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Nom de la Boutique *</label>
              <input
                type="text"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                placeholder="Ex: Pharmacie du Centre, Supermarché Nexa"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Slogan ou Description d'Activité</label>
              <input
                type="text"
                value={shopDescription}
                onChange={(e) => setShopDescription(e.target.value)}
                className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                placeholder="Ex: Commerce général de gros et détail"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Adresse Physique</label>
                <input
                  type="text"
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                  placeholder="Ex: 45 Rue de la Liberté, Dakar"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Téléphone Professionnel</label>
                <input
                  type="text"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium font-mono"
                  placeholder="Ex: +221 33 800 00 00"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider flex justify-between">
                  <span>Devise Active</span>
                </label>
                <select
                  value={shopCurrency}
                  onChange={(e) => setShopCurrency(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                >
                  <option value="EUR">EUR (€ - Euro)</option>
                  <option value="USD">USD ($ - Dollar US)</option>
                  <option value="XOF">XOF (CFA - Ouest-Africain)</option>
                  <option value="XAF">XAF (FCFA - Centre-Africain)</option>
                  <option value="MAD">MAD (DH - Dirham Marocain)</option>
                  <option value="CAD">CAD ($ - Dollar Canadien)</option>
                  <option value="GBP">GBP (£ - Livre de Sterling)</option>
                  <option value="CHF">CHF (CHF - Franc Suisse)</option>
                  <option value="GNF">GNF (FG - Franc Guinéen)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider flex justify-between">
                  <span>Taxe TVA (%) *</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="any"
                  value={shopTaxRate}
                  onChange={(e) => setShopTaxRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-gray-950 border border-gray-855 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-mono font-bold"
                  placeholder="Ex: 20, 18, 5"
                />
              </div>
            </div>

            <div className="bg-gray-950 border border-gray-855 p-3.5 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-gray-500 font-mono">
                <span>Aperçu de la Facturation de {shopName || 'Boutique'}</span>
                <span className="flex items-center gap-1 text-emerald-400 font-bold"><Coins className="w-3 h-3" /> Dynamique</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                  <p className="text-[9px] text-gray-500 uppercase font-mono">Taux de TVA</p>
                  <p className="text-[11px] font-bold text-cyan-400 font-mono mt-0.5 truncate">{shopTaxRate} %</p>
                </div>
                <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                  <p className="text-[9px] text-gray-500 uppercase font-mono">Prix Unitaire</p>
                  <p className="text-[11px] font-bold text-emerald-400 font-mono mt-0.5 truncate">{formatSample(8.99, shopCurrency)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                  <p className="text-[9px] text-gray-500 uppercase font-mono">Dépense / Dette</p>
                  <p className="text-[11px] font-bold text-red-400 font-mono mt-0.5 truncate">{formatSample(-45.00, shopCurrency)}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider font-sans">Logo de la Boutique</label>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative group">
                  <img
                    src={shopLogo || "https://images.unsplash.com/photo-1549421263-524f8dcef8d3?w=100&auto=format&fit=crop&q=60"}
                    alt="Logo boutique"
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-800 bg-gray-950 shadow-md transition group-hover:border-blue-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549421263-524f8dcef8d3?w=100&auto=format&fit=crop&q=60";
                    }}
                  />
                  {shopLogo && (
                    <button
                      type="button"
                      onClick={() => setShopLogo('')}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 shadow-md transition"
                      title="Supprimer le logo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                
                <div className="flex-1 w-full">
                  <label
                    htmlFor="logo-upload-input"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-800 hover:border-blue-500/50 bg-gray-950/50 hover:bg-gray-950 rounded-2xl p-4 cursor-pointer transition text-center"
                  >
                    <Upload className="w-5 h-5 text-gray-500 mb-1" />
                    <span className="text-xs text-gray-300 font-semibold">Cliquer pour uploader le logo</span>
                    <span className="text-[10px] text-gray-500 mt-0.5">Format PNG, JPG ou SVG (Max. 2 Mo)</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    id="logo-upload-input"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-850 gap-3">
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {isSaved && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/10 px-3.5 py-1.5 rounded-xl"
                >
                  <Check className="w-4 h-4 text-emerald-400" /> Configuration enregistrée avec succès !
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="submit"
            disabled={saveLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition disabled:opacity-50"
          >
            {saveLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Enregistrer la Boutique</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
