import React from 'react';
import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';

interface AdminUsersProps {
  db: any;
  activeUserId: string | null;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filteredUsers: any[];
  handleOpenPasswordModal: (userId: string) => void;
  handleDeleteUser: (userId: string) => void;
}

export default function AdminUsers({
  db,
  activeUserId,
  searchTerm,
  setSearchTerm,
  filteredUsers,
  handleOpenPasswordModal,
  handleDeleteUser,
}: AdminUsersProps) {
  return (
    <motion.div
      key="users"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* Active Session Info - Seul le Super Admin voit cela */}
      {activeUserId && (
        (() => {
          const connectedUser = db.users.find((u: any) => u.id === activeUserId);
          if (!connectedUser) return null;
          const connectedTenant = db.tenants.find((t: any) => t.id === connectedUser.tenantId);
          return (
            <div className="bg-emerald-950/20 border border-emerald-500/25 p-4 rounded-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <div>
                  <p className="text-xs font-bold text-gray-200">Session de Contrôle Active</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Super-administrateur actuellement connecté : <span className="text-emerald-400 font-bold">{connectedUser.name}</span> ({connectedUser.email}) — Boutique : <span className="text-blue-400 font-bold">{connectedTenant?.name || connectedUser.tenantId}</span>
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Super Admin
              </span>
            </div>
          );
        })()
      )}

      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Utilisateurs du SaaS (Multi-tenant)</h3>
        <input
          type="text"
          placeholder="Filtrer par nom, email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-xl pl-4 pr-4 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 search-fluid"
        />
      </div>

      <div className="overflow-x-auto border border-gray-800 rounded-xl table-responsive">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
            <tr>
              <th className="p-3">Collaborateur</th>
              <th className="p-3">Adresse E-mail</th>
              <th className="p-3">Rôle Assigné</th>
              <th className="p-3">Tenant (Boutique)</th>
              <th className="p-3">Statut de Connexion</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-850">
            {filteredUsers.map((u: any) => {
              const tenant = db.tenants.find((t: any) => t.id === u.tenantId);
              const tenantName = tenant ? tenant.name : 'Inconnu';
              const isCurrentUser = u.id === activeUserId;

              return (
                <tr key={u.id} className={`hover:bg-gray-950/20 transition ${isCurrentUser ? 'bg-emerald-950/5' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover border border-gray-800" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold flex items-center justify-center uppercase font-mono">{u.name[0]}</div>
                      )}
                      <span className="font-bold text-gray-200">{u.name}</span>
                      {isCurrentUser && (
                        <span className="text-[8px] uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 px-1 py-0.2 rounded font-bold">Moi</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-gray-400">{u.email}</td>
                  <td className="p-3">
                    <span className="text-[9px] font-mono bg-gray-950 border border-gray-800 px-2 py-0.5 rounded uppercase font-bold text-gray-400">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-gray-300">{tenantName}</td>
                  <td className="p-3">
                    {isCurrentUser ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        CONNECTÉ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-950 border border-gray-850 text-gray-500 text-[9px] font-medium font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-800" />
                        HORS LIGNE
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button
                      onClick={() => handleOpenPasswordModal(u.id)}
                      className="px-2 py-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 rounded-lg transition"
                      title="Réinitialiser le mot de passe et forcer la modification lors de la prochaine connexion"
                    >
                      Réinitialiser MDP
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition inline-flex items-center"
                      title="Supprimer définitivement l'utilisateur"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
