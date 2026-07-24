import { useState, useMemo, memo, FormEvent } from 'react';
import { motion } from 'motion/react';
import { Users, UserPlus, Trash2, Edit2, Shield, Key, Search, ShieldAlert, UserCheck, UserX, Info, BadgeAlert, X } from 'lucide-react';
import type { User, UserRole, DBState } from '../types';
import { useDB, useApp } from '../context';
import { ROLE_SPECS } from '../constants';
import { ConfirmDialog } from './shared/ConfirmDialog';

function UserManagementInner() {
  const { db, addNotification, handleUpdateDb } = useDB();
  const { activeTenantId, activeUserId } = useApp();

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const currentUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);
  const isAuthorized = useMemo(() => currentUser?.role === 'owner' || currentUser?.role === 'admin', [currentUser]);
  const tenantUsers = useMemo(() => db.users.filter(u => u.tenantId === activeTenantId), [db.users, activeTenantId]);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('vendeur');
  const [formPassword, setFormPassword] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formForceReset, setFormForceReset] = useState(true);
  const [deleteUserData, setDeleteUserData] = useState<{ id: string; name: string } | null>(null);

  const filteredUsers = useMemo(() => tenantUsers.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    let matchesStatus = true;
    if (statusFilter === 'active') matchesStatus = u.active;
    else if (statusFilter === 'inactive') matchesStatus = !u.active;
    else if (statusFilter === 'pending_reset') matchesStatus = !!u.firstLoginReset;
    return matchesSearch && matchesRole && matchesStatus;
  }), [tenantUsers, searchTerm, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: tenantUsers.length,
    active: tenantUsers.filter(u => u.active).length,
    adminCount: tenantUsers.filter(u => u.role === 'admin' || u.role === 'owner').length,
    pendingReset: tenantUsers.filter(u => u.firstLoginReset).length
  }), [tenantUsers]);

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setFormPassword(pass);
  };

  const handleOpenCreate = () => {
    setIsEditing(false); setEditingUserId(null); setFormName(''); setFormEmail(''); setFormRole('vendeur'); setFormPassword(''); setFormActive(true); setFormForceReset(true);
  };

  const handleOpenEdit = (user: User) => {
    setIsEditing(true); setEditingUserId(user.id); setFormName(user.name); setFormEmail(user.email); setFormRole(user.role); setFormPassword(user.password || ''); setFormActive(user.active); setFormForceReset(user.firstLoginReset || false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) { alert("Habilitations insuffisantes."); return; }
    if (!formName.trim() || !formEmail.trim()) { alert("Veuillez remplir le nom et l'email."); return; }

    if (!isEditing) {
      if (db.users.some(u => u.tenantId === activeTenantId && u.email.toLowerCase() === formEmail.toLowerCase())) { alert("Email déjà utilisé."); return; }
      const newUserId = `u-${Date.now()}`;
      const newUserObj: User = { id: newUserId, name: formName.trim(), email: formEmail.trim().toLowerCase(), role: formRole, tenantId: activeTenantId, active: formActive, password: formPassword || 'Nexa2026!', firstLoginReset: formForceReset };
      const auditLog = { id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), userId: activeUserId, userName: currentUser?.name || 'Admin', action: 'UTILISATEUR_CREE', details: `Création : ${newUserObj.name} (${newUserObj.role})`, tenantId: activeTenantId };
      handleUpdateDb({ ...db, users: [...db.users, newUserObj], auditLogs: [auditLog, ...(db.auditLogs || [])] } as DBState);
      addNotification(`Collaborateur créé : ${newUserObj.name} (${newUserObj.role})`);
      handleOpenCreate();
    } else {
      if (!editingUserId) return;
      if (editingUserId === activeUserId) {
        if (!formActive) { alert("Vous ne pouvez pas désactiver votre propre compte."); return; }
        if (formRole !== currentUser?.role) { alert("Vous ne pouvez pas modifier votre propre rôle."); return; }
      }
      const updatedUsers = db.users.map(u => u.id === editingUserId ? { ...u, name: formName.trim(), email: formEmail.trim().toLowerCase(), role: formRole, active: formActive, ...(formPassword ? { password: formPassword } : {}), firstLoginReset: formForceReset } : u);
      const auditLog = { id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), userId: activeUserId, userName: currentUser?.name || 'Admin', action: 'UTILISATEUR_MODIFIE', details: `Modification ID: ${editingUserId}. Rôle : ${formRole}`, tenantId: activeTenantId };
      handleUpdateDb({ ...db, users: updatedUsers, auditLogs: [auditLog, ...(db.auditLogs || [])] } as DBState);
      addNotification(`Compte mis à jour : ${formName}`);
      handleOpenCreate();
    }
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    if (!isAuthorized) { alert("Action non autorisée."); return; }
    if (userId === activeUserId) { alert("Vous ne pouvez pas supprimer votre propre compte."); return; }
    setDeleteUserData({ id: userId, name: userName });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-gray-900 border border-gray-850 p-5 rounded-2xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400"><Users className="w-5 h-5" /></div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">Gestion de l'Équipe & Habilitations
              <span className="text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Tenant: {activeTenant?.name}</span></h1>
            <p className="text-xs text-gray-400 mt-0.5">Supervisez les accès de vos collaborateurs, configurez les rôles métiers (RBAC).</p>
          </div>
        </div>
        {!isAuthorized && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 rounded-xl text-amber-400 text-xs">
            <ShieldAlert className="w-4 h-4 animate-pulse flex-shrink-0" /><div><p className="font-bold">Mode Lecture Seule Actif</p><p className="text-[10px] text-amber-400/80">Seuls les Owners ou Admins peuvent modifier l'équipe.</p></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between">
          <div><span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Collaborateurs</span><span className="text-xl font-black text-white block mt-1">{stats.total}</span></div>
          <div className="w-10 h-10 rounded-xl bg-gray-950 border border-gray-850 flex items-center justify-center text-gray-400"><Users className="w-5 h-5" /></div>
        </div>
        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between">
          <div><span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Membres Actifs</span><span className="text-xl font-black text-emerald-400 block mt-1">{stats.active}</span></div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-center text-emerald-400"><UserCheck className="w-5 h-5" /></div>
        </div>
        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between">
          <div><span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Privilèges Élevés</span><span className="text-xl font-black text-blue-400 block mt-1">{stats.adminCount}</span></div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/5 border border-blue-500/15 flex items-center justify-center text-blue-400"><Shield className="w-5 h-5" /></div>
        </div>
        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between">
          <div><span className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Reset Requis</span><span className="text-xl font-black text-amber-400 block mt-1">{stats.pendingReset}</span></div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-center justify-center text-amber-400"><Key className="w-5 h-5" /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-gray-950/20 border-b border-gray-850 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher par nom ou email..." className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium" />
                </div>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-mono font-bold">
                  <option value="all">Rôles : Tous</option>
                  <option value="owner">Owner</option><option value="admin">Admin</option><option value="gerant">Gérant</option><option value="vendeur">Vendeur</option><option value="comptable">Comptable</option><option value="stock_manager">Stock</option><option value="lecture_seule">Lecture Seule</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-mono font-bold">
                  <option value="all">Statuts : Tous</option>
                  <option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="pending_reset">Reset Requis</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-gray-500"><BadgeAlert className="w-8 h-8 mx-auto text-gray-600" /><p className="text-xs italic">Aucun collaborateur ne correspond à vos filtres.</p></div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                    <tr><th className="p-3.5">Nom complet / Email</th><th className="p-3.5">Rôle Système</th><th className="p-3.5">État d'accès</th><th className="p-3.5 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 font-medium text-gray-300">
                    {filteredUsers.map(u => {
                      const isMe = u.id === activeUserId;
                      return (
                        <tr key={u.id} className={`hover:bg-gray-950/10 transition ${isMe ? 'bg-blue-600/5' : ''}`}>
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              {u.avatar ? <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover border border-gray-800" /> : <div className="w-7 h-7 rounded-full bg-blue-600/15 border border-blue-500/10 text-blue-400 flex items-center justify-center font-bold font-mono uppercase text-xs">{u.name[0] || 'U'}</div>}
                              <div><span className="text-white font-bold text-xs flex items-center gap-1.5">{u.name}{isMe && <span className="text-[8px] font-bold font-mono uppercase bg-blue-500/20 text-blue-400 px-1 py-0.2 rounded">Moi</span>}</span><span className="text-[10px] text-gray-500 font-mono block mt-0.5">{u.email}</span></div>
                            </div>
                          </td>
                          <td className="p-3.5"><span className="text-[9px] font-mono font-bold bg-gray-950 border border-gray-800 px-2 py-0.5 rounded uppercase text-gray-400">{u.role}</span></td>
                          <td className="p-3.5 space-y-1">
                            <div className="flex flex-col gap-1">
                              {u.active ? <span className="text-[9px] font-bold font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 w-max"><UserCheck className="w-2.5 h-2.5" /> Actif</span> : <span className="text-[9px] font-bold font-mono text-red-400 bg-red-500/5 border border-red-500/10 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 w-max"><UserX className="w-2.5 h-2.5" /> Bloqué</span>}
                              {u.firstLoginReset && <span className="text-[8px] font-mono font-bold text-amber-400 bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.2 rounded uppercase flex items-center gap-0.5 w-max"><Key className="w-2 h-2 animate-pulse" /> Reset Requis</span>}
                            </div>
                          </td>
                          <td className="p-3.5 text-right space-x-1">
                            <button onClick={() => handleOpenEdit(u)} className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded transition inline-flex items-center" title="Modifier"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDeleteUser(u.id, u.name)} disabled={isMe || !isAuthorized} className={`p-1.5 rounded transition inline-flex items-center ${isMe || !isAuthorized ? 'text-gray-600 cursor-not-allowed opacity-30' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/15'}`} title={isMe ? "Impossible de supprimer votre propre compte" : "Révoquer l'accès"}><Trash2 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-3 bg-gray-950/20 border-t border-gray-850 flex justify-between items-center text-[10px] font-mono text-gray-500">
              <span>Tenant ID: {activeTenantId}</span>
              <span>Filtré : {filteredUsers.length} / {tenantUsers.length} comptes</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl space-y-4">
            <div className="p-4.5 border-b border-gray-850 bg-gray-950/20 flex justify-between items-center">
              <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-blue-400" /><h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">{isEditing ? 'Modifier les habilitations' : "Créer un compte d'accès"}</h3></div>
              {isEditing && <button onClick={handleOpenCreate} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-850 transition" title="Annuler"><X className="w-4 h-4" /></button>}
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-left">
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 font-mono">Nom Complet *</label><input type="text" required disabled={!isAuthorized} value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-40" placeholder="ex: Barry Hassim" /></div>
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 font-mono">Adresse email *</label><input type="email" required disabled={!isAuthorized} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-40" placeholder="ex: h.barry@nexastock.com" /></div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">{isEditing ? 'Nouveau mot de passe (Facultatif)' : 'Mot de passe provisoire *'}</label>
                <div className="flex gap-2">
                  <input type="text" required={!isEditing} disabled={!isAuthorized} value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="flex-1 bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-40" placeholder={isEditing ? 'Inchangé si vide' : 'ex: NexaPass2026!'} />
                  <button type="button" disabled={!isAuthorized} onClick={generateRandomPassword} className="bg-gray-800 hover:bg-gray-750 text-gray-300 font-mono text-[10px] px-2.5 py-1.5 rounded-xl border border-gray-850 hover:text-white transition disabled:opacity-40">Générer</button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 font-mono">Rôle Système (RBAC) *</label>
                <select value={formRole} disabled={!isAuthorized} onChange={(e) => setFormRole(e.target.value as any)} className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition disabled:opacity-40 font-mono font-bold">
                  <option value="vendeur">Vendeur (POS)</option><option value="gerant">Gérant (POS + Produits)</option><option value="admin">Administrateur (Complet)</option><option value="owner">Co-propriétaire (Root)</option><option value="comptable">Comptable (Finances)</option><option value="stock_manager">Gestionnaire de Stock</option><option value="lecture_seule">Lecture Seule</option>
                </select>
                <div className="mt-2 p-3 bg-gray-950 border border-gray-855 rounded-xl flex gap-2.5">
                  <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-gray-300 font-mono uppercase tracking-wider">{ROLE_SPECS[formRole]?.label}</p>
                    <p className="text-[10px] text-gray-400 font-sans leading-normal">{ROLE_SPECS[formRole]?.desc}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 pt-2 border-t border-gray-850">
                <label className="flex items-center gap-3.5 cursor-pointer group text-xs text-gray-300">
                  <input type="checkbox" disabled={!isAuthorized} checked={formActive} onChange={(e) => setFormActive(e.target.checked)} className="w-4 h-4 rounded bg-gray-950 border-gray-800 text-blue-600 focus:ring-0 cursor-pointer disabled:opacity-40" />
                  <div><span className="font-bold text-gray-200">Compte Actif</span><span className="block text-[10px] text-gray-500 mt-0.5">Désactivez pour révoquer l'accès sans supprimer le profil.</span></div>
                </label>
                <label className="flex items-center gap-3.5 cursor-pointer group text-xs text-gray-300">
                  <input type="checkbox" disabled={!isAuthorized} checked={formForceReset} onChange={(e) => setFormForceReset(e.target.checked)} className="w-4 h-4 rounded bg-gray-950 border-gray-800 text-blue-600 focus:ring-0 cursor-pointer disabled:opacity-40" />
                  <div><span className="font-bold text-gray-200 flex items-center gap-1.5">Forcer la modification du mot de passe <span className="text-[8px] font-mono bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded font-bold uppercase">Sécurité</span></span><span className="block text-[10px] text-gray-500 mt-0.5">L'utilisateur devra modifier son mot de passe à la première connexion.</span></div>
                </label>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-850">
                <p className="text-[9px] text-gray-500 font-mono leading-relaxed max-w-[200px]">Les opérations sont enregistrées dans le journal d'audit.</p>
                <button type="submit" disabled={!isAuthorized}
                  className={`text-xs font-bold px-5 py-2.5 rounded-xl transition ${isAuthorized ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/15' : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-850'}`}>
                  {isEditing ? 'Mettre à jour' : "Ajouter à l'Équipe"}</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteUserData !== null}
        title="Révoquer l'accès"
        message={deleteUserData ? `Supprimer le compte de ${deleteUserData.name} ?` : ''}
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (!deleteUserData) return;
          const auditLog = { id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), userId: activeUserId, userName: currentUser?.name || 'Admin', action: 'UTILISATEUR_SUPPRIME', details: `Suppression : ${deleteUserData.name}`, tenantId: activeTenantId };
          handleUpdateDb({ ...db, users: db.users.filter(u => u.id !== deleteUserData.id), auditLogs: [auditLog, ...(db.auditLogs || [])] } as DBState);
          addNotification(`Accès révoqué pour : ${deleteUserData.name}`);
          if (editingUserId === deleteUserData.id) handleOpenCreate();
          setDeleteUserData(null);
        }}
        onCancel={() => setDeleteUserData(null)}
      />
    </div>
  );
}

export default memo(UserManagementInner);
