import React from 'react';
import { motion } from 'motion/react';

interface AdminLogsProps {
  db: any;
}

export default function AdminLogs({ db }: AdminLogsProps) {
  return (
    <motion.div
      key="logs"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Chronologie des Événements & Audit Comptable</h3>
      <p className="text-xs text-gray-400">
        Chaque action sensible (activation, modification de prix, suppression d'article) est enregistrée de manière immuable pour l'audit.
      </p>

      <div className="overflow-x-auto border border-gray-800 rounded-xl mt-2 max-h-96 table-responsive">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
            <tr>
              <th className="p-3">Horodatage (UTC)</th>
              <th className="p-3">Auteur</th>
              <th className="p-3">Action Système</th>
              <th className="p-3">Détails d'Évènement</th>
              <th className="p-3">Boutique ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-850 font-mono text-[10.5px]">
            {(db.auditLogs || []).map((lg: any, idx: number) => (
              <tr key={idx} className="hover:bg-gray-950/20 transition text-gray-400">
                <td className="p-3 text-gray-500 font-sans">{new Date(lg.timestamp).toLocaleString('fr-FR')}</td>
                <td className="p-3 font-sans text-gray-200">{lg.userName}</td>
                <td className="p-3 font-bold text-red-400 uppercase">{lg.action}</td>
                <td className="p-3 text-gray-300 font-sans">{lg.details}</td>
                <td className="p-3 text-gray-500">{lg.tenantId || 'SaaS root'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
