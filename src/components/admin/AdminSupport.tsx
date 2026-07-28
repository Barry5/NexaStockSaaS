import React from 'react';
import { motion } from 'motion/react';

interface AdminSupportProps {
  supportTickets: any[];
  setSelectedTicketId: (v: string | null) => void;
  selectedTicketId: string | null;
  replyText: string;
  setReplyText: (v: string) => void;
  handleSendTicketReply: (ticketId: string) => void;
}

export default function AdminSupport({
  supportTickets,
  setSelectedTicketId,
  selectedTicketId,
  replyText,
  setReplyText,
  handleSendTicketReply,
}: AdminSupportProps) {
  return (
    <motion.div
      key="support"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Assistance Client & Support Desk</h3>
      <p className="text-xs text-gray-400">
        Aidez vos clients en répondant directement à leurs questions techniques ou demandes d'activation manuelle.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        <div className="lg:col-span-5 space-y-3">
          {supportTickets.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedTicketId(t.id)}
              className={`w-full p-4 rounded-xl border text-left transition ${
                selectedTicketId === t.id 
                  ? 'bg-red-500/10 border-red-500/30 text-white' 
                  : 'bg-gray-950 border-gray-850 hover:border-gray-800 text-gray-400'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-500">{t.date}</span>
                <span className={`px-2 py-0.5 text-[8px] font-mono font-bold rounded uppercase ${
                  t.status === 'Ouvert' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-gray-800 text-gray-500'
                }`}>
                  {t.status}
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-200 mt-2 truncate">{t.subject}</h4>
              <p className="text-[10px] text-gray-500 mt-0.5 truncate">Par : {t.sender}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-7">
          {selectedTicketId ? (() => {
            const ticket = supportTickets.find((t: any) => t.id === selectedTicketId);
            if (!ticket) return null;
            return (
              <div className="bg-gray-950 border border-gray-850 rounded-xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-gray-400 font-mono">Détails de la demande</h4>
                  <h3 className="text-sm font-bold text-white mt-1">{ticket.subject}</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">Expéditeur : {ticket.sender} | Date : {ticket.date}</p>
                </div>

                <div className="bg-gray-900 border border-gray-850 p-3.5 rounded-xl text-xs text-gray-300 leading-relaxed whitespace-pre-line font-medium">
                  {ticket.text}
                </div>

                {ticket.status === 'Ouvert' && (
                  <div className="space-y-3.5 pt-2 border-t border-gray-900">
                    <label className="block text-[10px] font-mono text-gray-500 uppercase">Rédiger votre réponse d'assistance :</label>
                    <textarea
                      rows={4}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-850 text-xs rounded-xl px-4 py-2.5 text-white"
                      placeholder="ex: Bonjour, pour imprimer, cliquez sur le bouton PDF dans le POS ou Ctrl+P..."
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSendTicketReply(ticket.id)}
                        className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                      >
                        Envoyer la réponse & Clôturer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="bg-gray-950 border border-gray-850 rounded-xl p-8 text-center text-xs text-gray-500 italic h-full flex items-center justify-center">
              Sélectionnez un ticket pour visualiser l'historique de la discussion.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
