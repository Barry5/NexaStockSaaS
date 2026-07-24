import { motion } from 'motion/react';
import { Check, Handshake } from 'lucide-react';
import type { Sale } from '../../types';

interface POSCheckoutSuccessModalProps {
  checkoutSuccess: boolean;
  generatedSale: Sale | null;
  activeTenant: any;
  currency: string;
  commissionNotification?: string;
  onPrintReceipt: () => void;
  onNewSale: () => void;
}

export default function POSCheckoutSuccessModal(props: POSCheckoutSuccessModalProps) {
  const { checkoutSuccess, generatedSale, activeTenant, currency, commissionNotification, onPrintReceipt, onNewSale } = props;

  if (!checkoutSuccess || !generatedSale) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-gray-900 border border-gray-850 p-6 rounded-2xl shadow-2xl space-y-4"
      >
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-white uppercase font-mono">Vente Enregistrée avec Succès !</h3>
          <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
            La transaction <strong className="text-white">{generatedSale.invoiceNumber}</strong> est validée. Le stock a été décrémenté localement et synchronisé avec le serveur cloud NexaStock.
          </p>
        </div>

        {/* Micro receipt visualizer */}
        <div className="bg-white text-gray-900 p-4 rounded-xl border border-gray-200 text-xs font-mono space-y-1.5 leading-tight">
          <p className="text-center font-bold">{activeTenant?.name}</p>
          <p className="text-[10px] text-gray-600 text-center">Ref: {generatedSale.invoiceNumber}</p>
          <div className="border-t border-dashed border-gray-300 my-1"></div>
          {generatedSale.items.map((it: any, idx: number) => (
            <div key={idx} className="flex justify-between text-[10px]">
              <span>{it.productName} (x{it.quantity})</span>
              <span>{it.total.toLocaleString()}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-gray-300 my-1"></div>
          <div className="flex justify-between text-[10px] font-bold">
            <span>TOTAL REÇU :</span>
            <span>{generatedSale.total.toLocaleString()} {currency}</span>
          </div>
          <p className="text-[10px] text-gray-500 text-center pt-2">Merci pour votre visite !</p>
        </div>

        {commissionNotification && (
          <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-blue-400 font-bold flex items-center justify-center gap-1.5">
              <Handshake className="w-3.5 h-3.5" /> {commissionNotification}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <button
            onClick={onPrintReceipt}
            className="w-full bg-gray-950 border border-gray-850 text-gray-300 hover:bg-gray-850 font-bold py-2 rounded-xl transition"
          >
            Imprimer le Reçu Complet
          </button>
          <button
            onClick={onNewSale}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition shadow-lg shadow-blue-500/10"
          >
            Nouvelle Vente Caisse
          </button>
        </div>
      </motion.div>
    </div>
  );
}
