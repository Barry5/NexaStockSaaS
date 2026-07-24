import { motion } from 'motion/react';
import { Building, CheckCircle } from 'lucide-react';

interface POSParametrageProps {
  tenantName: string; setTenantName: (v: string) => void;
  tenantCurrency: string; setTenantCurrency: (v: string) => void;
  invoicePrefix: string; setInvoicePrefix: (v: string) => void;
  invoiceFooterMsg: string; setInvoiceFooterMsg: (v: string) => void;
  invoiceSubFooterMsg: string; setInvoiceSubFooterMsg: (v: string) => void;
  defaultExtraFeeLabel: string; setDefaultExtraFeeLabel: (v: string) => void;
  handleSaveTenantConfig: () => void;
}

export default function POSParametrage(props: POSParametrageProps) {
  const {
    tenantName, setTenantName,
    tenantCurrency, setTenantCurrency,
    invoicePrefix, setInvoicePrefix,
    invoiceFooterMsg, setInvoiceFooterMsg,
    invoiceSubFooterMsg, setInvoiceSubFooterMsg,
    defaultExtraFeeLabel, setDefaultExtraFeeLabel,
    handleSaveTenantConfig,
  } = props;

  return (
    <motion.div
      key="pos-parametrage"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="bg-gray-900 border border-gray-850 p-6 rounded-2xl space-y-6">
        <div className="border-b border-gray-850 pb-4">
          <h3 className="text-sm font-black text-white font-mono flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-500" /> PARAMÉTRAGE DE LA FACTURATION & DEVISE SAAS
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Personnalisez les mentions légales, la devise monétaire de facturation et l'en-tête de vos PDF générés pour votre organisation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Section 1: Organisation & Devise */}
          <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-850">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
              1. Identité & Devise Monétaire
            </h4>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Nom de l'Organisation</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Ex: NexaShop SARL"
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Devise de Facturation</label>
              <input
                type="text"
                value={tenantCurrency}
                onChange={(e) => setTenantCurrency(e.target.value)}
                placeholder="Ex: FCFA, EUR, USD, GNF..."
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-bold font-mono"
              />
              <p className="text-[9px] text-gray-500 italic leading-snug">
                La devise configurée ici sera automatiquement appliquée à l'ensemble du terminal de vente, de l'historique et des forfaits de l'organisation.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Libellé Frais Supplémentaires par Défaut</label>
              <input
                type="text"
                value={defaultExtraFeeLabel}
                onChange={(e) => setDefaultExtraFeeLabel(e.target.value)}
                placeholder="Ex: Frais de transport, Man d'œuvre, Transport"
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Section 2: Mentions & Pied de page PDF */}
          <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-850">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
              2. En-tête & Pied de Facture PDF
            </h4>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Préfixe de Facture</label>
              <input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="Ex: FAC-, INV-, FACT-"
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Message de Remerciement (Pied de Page)</label>
              <input
                type="text"
                value={invoiceFooterMsg}
                onChange={(e) => setInvoiceFooterMsg(e.target.value)}
                placeholder="Ex: MERCI DE VOTRE CONFIANCE !"
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase block">Sous-mention Légale (Sub-Footer)</label>
              <input
                type="text"
                value={invoiceSubFooterMsg}
                onChange={(e) => setInvoiceSubFooterMsg(e.target.value)}
                placeholder="Ex: NexaStock ERP - Document officiel au format PDF"
                className="w-full bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

        </div>

        <div className="pt-4 border-t border-gray-850 flex justify-end">
          <button
            type="button"
            onClick={handleSaveTenantConfig}
            className="bg-blue-600 hover:bg-blue-500 transition text-white text-xs font-mono font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-500/10 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" /> Enregistrer la Configuration Facture
          </button>
        </div>
      </div>
    </motion.div>
  );
}
