import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import { UserPlus } from 'lucide-react';

interface POSQuickCustomerModalProps {
  isAddCustomerOpen: boolean;
  setIsAddCustomerOpen: (v: boolean) => void;
  newCustName: string; setNewCustName: (v: string) => void;
  newCustPhone: string; setNewCustPhone: (v: string) => void;
  newCustEmail: string; setNewCustEmail: (v: string) => void;
  handleQuickCreateCustomer: (e: FormEvent) => void;
}

export default function POSQuickCustomerModal(props: POSQuickCustomerModalProps) {
  const {
    isAddCustomerOpen,
    setIsAddCustomerOpen,
    newCustName, setNewCustName,
    newCustPhone, setNewCustPhone,
    newCustEmail, setNewCustEmail,
    handleQuickCreateCustomer,
  } = props;

  if (!isAddCustomerOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-gray-900 border border-gray-850 p-6 rounded-2xl shadow-2xl space-y-4"
      >
        <div className="flex justify-between items-center pb-2 border-b border-gray-850">
          <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-blue-500" /> Nouveau Client
          </h4>
          <button onClick={() => setIsAddCustomerOpen(false)} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleQuickCreateCustomer} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Nom Complet *</label>
            <input
              type="text"
              required
              placeholder="ex: Barry Hassim"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Téléphone (WhatsApp)</label>
            <input
              type="text"
              placeholder="ex: +224 620 00 00 00"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Adresse E-mail</label>
            <input
              type="email"
              placeholder="ex: client@gmail.com"
              value={newCustEmail}
              onChange={(e) => setNewCustEmail(e.target.value)}
              className="w-full bg-gray-950 border border-gray-850 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-700 focus:outline-none"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsAddCustomerOpen(false)}
              className="flex-1 bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 font-bold py-2 rounded-xl transition text-xs"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition text-xs shadow-lg shadow-blue-500/10"
            >
              Ajouter Client
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
