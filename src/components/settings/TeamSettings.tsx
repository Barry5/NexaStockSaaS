import React from 'react';
import {
  Check,
  Key,
  Lock,
  Plus,
  Trash2
} from 'lucide-react';

interface TeamSettingsProps {
  tenantUsers: any[];
  tenantPlanStatus: any;
  handleCreateUser: (e: React.FormEvent) => void;
  handleDeleteTeamUser: (userId: string, name: string) => void;
  handleOpenPasswordModal: (userId: string) => void;
  newUserName: string;
  setNewUserName: (v: string) => void;
  newUserEmail: string;
  setNewUserEmail: (v: string) => void;
  newUserPassword: string;
  setNewUserPassword: (v: string) => void;
  newUserRole: string;
  setNewUserRole: (v: any) => void;
  activeUserId: string;
  handleSwitchUser: (userId: string) => void;
  db: any;
  activeTenantId: string;
}

export default function TeamSettings({
  tenantUsers,
  tenantPlanStatus,
  handleCreateUser,
  handleDeleteTeamUser,
  handleOpenPasswordModal,
  newUserName,
  setNewUserName,
  newUserEmail,
  setNewUserEmail,
  newUserPassword,
  setNewUserPassword,
  newUserRole,
  setNewUserRole,
  activeUserId,
  handleSwitchUser,
  db,
  activeTenantId,
}: TeamSettingsProps) {
  return (
    <>
      {/* 1. ACTIVE USERS TABLE & CRUD FOR CURRENT TENANT */}
      <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Collaborateurs de l'entreprise</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ajoutez et gérez les comptes d'accès pour les gérants et vendeurs de votre boutique.</p>
          </div>
          {tenantPlanStatus && (
            <span className="text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-lg uppercase">
              Utilisateurs : {tenantPlanStatus.users.current} / {tenantPlanStatus.users.max}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
              <tr>
                <th className="p-3.5">Avatar / Nom</th>
                <th className="p-3.5">Email</th>
                <th className="p-3.5">Rôle Système</th>
                <th className="p-3.5">Statut de Connexion</th>
                <th className="p-3.5 text-right">Actions de Contrôle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850 font-medium text-gray-300">
              {tenantUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-950/10 transition">
                  <td className="p-3.5 flex items-center gap-2.5">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover border border-gray-800" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold font-mono uppercase text-xs">
                        {u.name[0]}
                      </div>
                    )}
                    <span className="text-white font-bold">{u.name}</span>
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-gray-400">{u.email}</td>
                  <td className="p-3.5">
                    <span className="text-[9px] font-mono bg-gray-950 border border-gray-800 px-2 py-0.5 rounded uppercase font-bold text-gray-400">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3.5">
                    {u.firstLoginReset ? (
                      <span className="text-[9px] font-bold font-mono text-amber-400 bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded uppercase flex items-center gap-1 w-max">
                        <Key className="w-2.5 h-2.5 animate-pulse" /> Réinitialisation requise
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded uppercase flex items-center gap-1 w-max">
                        <Check className="w-2.5 h-2.5" /> Compte Validé
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-right space-x-1.5">
                    {u.firstLoginReset && (
                      <button
                        onClick={() => handleOpenPasswordModal(u.id)}
                        className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition text-[10px] px-2 py-1 rounded font-bold"
                        title="Déclencher la modification du MDP à la première connexion"
                      >
                        Changer Mot de passe
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTeamUser(u.id, u.name)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/15 p-1.5 rounded transition inline-flex items-center"
                      title="Révoquer l'accès"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form to create a brand new team user */}
        <div className="lg:col-span-7 bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4.5 h-4.5 text-blue-400" />
            <h4 className="text-xs font-bold uppercase text-white font-mono">Ajouter un collaborateur d'équipe</h4>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Nom complet *</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white"
                  placeholder="ex: Mamadou Diallo"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Adresse email d'accès *</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                  placeholder="ex: m.diallo@gstock.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Mot de passe provisoire *</label>
                <input
                  type="password"
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-855 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Rôle / Habilitation *</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as any)}
                  className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white"
                >
                  <option value="vendeur">Vendeur (POS Caisse Uniquement)</option>
                  <option value="gerant">Gérant de Boutique (POS + Catalogue)</option>
                  <option value="owner">Co-propriétaire (Tous droits d'écriture)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-850">
              <p className="text-[9px] text-gray-500 font-mono leading-relaxed max-w-sm">
                * Le mot de passe devra être obligatoirement modifié par le gérant lors de sa toute première connexion afin de garantir la sécurité.
              </p>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition"
              >
                Ajouter à l'Équipe
              </button>
            </div>
          </form>
        </div>

        {/* RBAC Rules Matrix */}
        <div className="lg:col-span-5 bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" />
            <h4 className="text-xs font-bold uppercase text-white font-mono">Habilitations des Rôles (RBAC)</h4>
          </div>
          
          <p className="text-[11px] text-gray-400 leading-normal">
            Chaque rôle d'équipe correspond à un niveau d'accès strict. Pour tester un rôle différent, vous pouvez basculer d'avatar ci-dessous :
          </p>

          {/* Switcher avatar simulation */}
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {db.users.filter((u: any) => u.tenantId === activeTenantId).map((u: any) => {
              const isActive = u.id === activeUserId;
              return (
                <button
                  key={u.id}
                  onClick={() => handleSwitchUser(u.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition ${
                    isActive 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-white' 
                      : 'bg-gray-950 border-gray-855 hover:border-gray-800 text-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center font-bold text-[10px] text-white uppercase">
                      {u.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-200">{u.name}</p>
                      <p className="text-[9px] text-gray-500 uppercase">{u.role}</p>
                    </div>
                  </div>
                  {isActive && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Connecté</span>}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
