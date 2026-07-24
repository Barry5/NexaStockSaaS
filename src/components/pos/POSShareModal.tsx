import { motion } from 'motion/react';
import { Send } from 'lucide-react';

interface POSShareModalProps {
  shareModalOpen: boolean;
  selectedSaleDetail: any;
  shareChannel: 'whatsapp' | 'email'; setShareChannel: (v: 'whatsapp' | 'email') => void;
  shareContactValue: string; setShareContactValue: (v: string) => void;
  handleShareActualFile: () => Promise<void>;
  setShareModalOpen: (v: boolean) => void;
  activeTenant: any;
  currency: string;
}

export default function POSShareModal(props: POSShareModalProps) {
  const {
    shareModalOpen,
    selectedSaleDetail,
    shareChannel, setShareChannel,
    shareContactValue, setShareContactValue,
    handleShareActualFile,
    setShareModalOpen,
    activeTenant,
    currency,
  } = props;

  if (!shareModalOpen || !selectedSaleDetail) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-gray-900 border border-gray-850 p-6 rounded-2xl shadow-2xl space-y-4"
      >
        <div className="flex justify-between items-center pb-2 border-b border-gray-850">
          <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
            <Send className="w-4 h-4 text-blue-500" /> PARTAGE NUMÉRIQUE
          </h4>
          <button onClick={() => setShareModalOpen(false)} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="flex gap-2 bg-gray-950 p-1 border border-gray-850 rounded-xl text-xs">
          <button
            onClick={() => {
              setShareChannel('whatsapp');
              setShareContactValue(selectedSaleDetail.customerPhone || '');
            }}
            className={`flex-1 py-1 rounded-lg font-bold transition ${
              shareChannel === 'whatsapp' ? 'bg-emerald-600 text-white' : 'text-gray-400'
            }`}
          >
            WhatsApp (Message pré-rempli)
          </button>
          <button
            onClick={() => {
              setShareChannel('email');
              setShareContactValue(selectedSaleDetail.customerEmail || '');
            }}
            className={`flex-1 py-1 rounded-lg font-bold transition ${
              shareChannel === 'email' ? 'bg-blue-600 text-white' : 'text-gray-400'
            }`}
          >
            E-mail (Facture PDF jointe)
          </button>
        </div>

        <div className="space-y-1.5 text-xs">
          <label className="text-[10px] font-mono text-gray-500 uppercase">
            {shareChannel === 'whatsapp' ? 'N° Téléphone WhatsApp *' : 'Adresse E-mail Destinataire *'}
          </label>
          <input
            type="text"
            required
            placeholder={shareChannel === 'whatsapp' ? 'ex: +224620000000' : 'ex: client@gmail.com'}
            value={shareContactValue}
            onChange={(e) => setShareContactValue(e.target.value)}
            className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white"
          />
        </div>

        {/* Preview of the pre-filled message */}
        <div className="bg-gray-950 p-3 rounded-xl border border-gray-850 text-[10px] text-gray-400 font-mono space-y-1 leading-normal max-h-[140px] overflow-y-auto">
          <p className="font-bold text-gray-300">Aperçu du message :</p>
          <p className="whitespace-pre-line text-emerald-400">
            {shareChannel === 'whatsapp' 
              ? `Bonjour ! Voici le reçu de votre transaction chez ${activeTenant?.name}.\n\n🧾 Facture : ${selectedSaleDetail.invoiceNumber}\n💰 Montant Total : ${selectedSaleDetail.total.toLocaleString()} ${currency}\n⏱️ Statut : ${selectedSaleDetail.status}\n\nMerci de votre confiance !`
              : `Cher client,\n\nVeuillez trouver ci-joint votre facture officielle ${selectedSaleDetail.invoiceNumber} pour un montant total de ${selectedSaleDetail.total.toLocaleString()} ${currency}.\n\nCordialement,\nService Comptabilité - ${activeTenant?.name}`
            }
          </p>
        </div>

        <div className="flex gap-2 pt-2 text-xs">
          <button
            onClick={() => setShareModalOpen(false)}
            className="flex-1 bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 font-bold py-2 rounded-xl transition"
          >
            Annuler
          </button>
          <button
            onClick={handleShareActualFile}
            className={`flex-1 font-bold py-2 rounded-xl transition text-white ${
              shareChannel === 'whatsapp' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            Envoyer Reçu
          </button>
        </div>
      </motion.div>
    </div>
  );
}
