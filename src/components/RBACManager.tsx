import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, ShieldCheck, ShieldOff, Plus, Trash2, Save, X, ChevronDown, ChevronRight,
  Users, Lock, Unlock, RefreshCw, AlertTriangle, Check, Search, Edit3
} from 'lucide-react';
import type { Role, Permission, RolePermission } from '../types';
import { useDB, useApp } from '../context';
import { PERMISSION_MODULES, PERMISSION_DESCRIPTORS } from '../constants/permissions';
import { ConfirmDialog } from './shared/ConfirmDialog';

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

interface RoleWithMeta extends Role {
  permissionCount: number;
  userCount: number;
}

export default function RBACManager() {
  const { db, addNotification } = useDB();
  const { activeTenantId, activeUserId } = useApp();

  const [roles, setRoles] = useState<RoleWithMeta[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groupedPerms, setGroupedPerms] = useState<Record<string, Permission[]>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissionMap, setPermissionMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  const currentUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);
  const canManagePermissions = currentUser?.role === 'superadmin' || currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, permsRes] = await Promise.all([
        authFetch('/api/rbac/roles'),
        authFetch('/api/rbac/permissions'),
      ]);
      if (!rolesRes.ok || !permsRes.ok) throw new Error('Erreur de chargement');
      const rolesData = await rolesRes.json();
      const permsData = await permsRes.json();
      setRoles(rolesData.roles);
      setPermissions(permsData.permissions);
      setGroupedPerms(permsData.grouped);

      // Auto-select first role if none selected
      if (!selectedRoleId && rolesData.roles.length > 0) {
        setSelectedRoleId(rolesData.roles[0].id);
      }
    } catch (e) {
      setError('Impossible de charger les données RBAC.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Load permissions for selected role
  useEffect(() => {
    if (!selectedRoleId) return;
    (async () => {
      try {
        const res = await authFetch(`/api/rbac/roles/${selectedRoleId}/permissions`);
        if (res.ok) {
          const data = await res.json();
          setPermissionMap(data.permissionMap || {});
        }
      } catch {}
    })();
  }, [selectedRoleId]);

  const togglePermission = (key: string) => {
    setPermissionMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleModule = (moduleKey: string) => {
    const modulePerms = groupedPerms[moduleKey] || [];
    const allEnabled = modulePerms.every(p => permissionMap[p.key]);
    const newValue = !allEnabled;
    const updated = { ...permissionMap };
    for (const p of modulePerms) {
      updated[p.key] = newValue;
    }
    setPermissionMap(updated);
  };

  const hasModuleChanged = (moduleKey: string) => {
    if (!selectedRoleId) return false;
    const modulePerms = groupedPerms[moduleKey] || [];
    return modulePerms.some(p => {
      const current = permissionMap[p.key];
      return current !== undefined;
    });
  };

  const hasChanges = useMemo(() => {
    return Object.keys(permissionMap).length > 0;
  }, [permissionMap]);

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/rbac/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: permissionMap }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de sauvegarde');
      }
      addNotification('Permissions mises à jour avec succès.', 'success');
      fetchData();
    } catch (e: any) {
      addNotification(e.message || 'Erreur lors de la sauvegarde.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newRoleName || !newRoleLabel) return;
    try {
      const res = await authFetch('/api/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, label: newRoleLabel, description: newRoleDesc }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de création');
      }
      const data = await res.json();
      addNotification(`Rôle "${data.role.label}" créé.`, 'success');
      setShowCreateRole(false);
      setNewRoleName('');
      setNewRoleLabel('');
      setNewRoleDesc('');
      setSelectedRoleId(data.role.id);
      fetchData();
    } catch (e: any) {
      addNotification(e.message || 'Erreur de création.', 'error');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    setDeleteRoleId(roleId);
  };

  const confirmDeleteRole = async () => {
    if (!deleteRoleId) return;
    try {
      const res = await authFetch(`/api/rbac/roles/${deleteRoleId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de suppression');
      }
      addNotification('Rôle supprimé.', 'success');
      if (selectedRoleId === deleteRoleId) setSelectedRoleId(null);
      fetchData();
    } catch (e: any) {
      addNotification(e.message || 'Erreur de suppression.', 'error');
    }
    setDeleteRoleId(null);
  };

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const filteredModules = PERMISSION_MODULES.filter(m =>
    m.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Chargement des permissions...
      </div>
    );
  }

  if (!canManagePermissions) {
    return (
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl text-center">
        <ShieldOff className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-gray-300">Accès restreint</h3>
        <p className="text-xs text-gray-500 mt-1">Vous n'avez pas les droits nécessaires pour gérer les permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold font-display text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-blue" />
            Gestion des Permissions (RBAC)
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Contrôle d'accès basé sur les rôles — Gérez finement les droits de chaque profil
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-750 text-gray-300 px-3 py-2 rounded-xl text-xs font-semibold transition">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button onClick={() => setShowCreateRole(true)} className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-semibold transition">
            <Plus className="w-3.5 h-3.5" /> Nouveau rôle
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Main Layout: Role List + Permission Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Left: Role List */}
        <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Rôles ({roles.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-850 max-h-[500px] overflow-y-auto">
            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full text-left px-4 py-3 transition flex items-center justify-between ${
                  selectedRoleId === role.id ? 'bg-blue-600/10 border-l-2 border-blue-500' : 'hover:bg-gray-850 border-l-2 border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-200 truncate flex items-center gap-1.5">
                    {role.is_system ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3 text-emerald-500" />}
                    {role.label}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {role.permissionCount} droits • {role.userCount} utilisateur(s)
                  </p>
                </div>
                {!role.is_system && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                    className="p-1 text-gray-500 hover:text-red-400 rounded transition flex-shrink-0 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Permission Editor */}
        <div className="lg:col-span-9 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {selectedRole ? (
            <>
              {/* Role header */}
              <div className="px-5 py-4 border-b border-gray-800 bg-gray-950/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${selectedRole.is_system ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedRole.label}</h3>
                    <p className="text-[10px] text-gray-500">{selectedRole.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges && (
                    <button onClick={savePermissions} disabled={saving}
                      className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                    >
                      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? 'Sauvegarde...' : 'Enregistrer'}
                    </button>
                  )}
                  <span className="text-[10px] text-gray-500 font-mono">{selectedRole.name}</span>
                </div>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b border-gray-850">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrer les modules..."
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>

              {/* Permissions grid */}
              <div className="p-5 max-h-[600px] overflow-y-auto space-y-1">
                {filteredModules.map(module => {
                  const modulePerms = groupedPerms[module.key] || [];
                  if (modulePerms.length === 0) return null;
                  const isExpanded = expandedModules[module.key] !== false;
                  const allEnabled = modulePerms.every(p => permissionMap[p.key]);
                  const someEnabled = modulePerms.some(p => permissionMap[p.key]);

                  return (
                    <div key={module.key} className="border border-gray-800 rounded-xl overflow-hidden">
                      {/* Module header */}
                      <div
                        onClick={() => setExpandedModules(prev => ({ ...prev, [module.key]: !isExpanded }))}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-950/30 hover:bg-gray-950/50 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                          <span className="text-xs font-bold text-gray-200">{module.label}</span>
                          <span className="text-[9px] text-gray-600 font-mono">({modulePerms.length})</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleModule(module.key); }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                            allEnabled
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : someEnabled
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}
                        >
                          {allEnabled ? 'Tout activé' : someEnabled ? 'Partiel' : 'Tout désactivé'}
                        </button>
                      </div>

                      {/* Permission toggles */}
                      {isExpanded && (
                        <div className="px-4 py-2.5 bg-gray-950/10 border-t border-gray-850">
                          <div className="flex flex-wrap gap-2">
                            {modulePerms.map(p => {
                              const isAllowed = permissionMap[p.key];
                              const desc = PERMISSION_DESCRIPTORS[p.key];
                              return (
                                <button
                                  key={p.key}
                                  onClick={() => togglePermission(p.key)}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition ${
                                    isAllowed
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15'
                                      : 'bg-gray-850 border-gray-700 text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                  }`}
                                  title={desc?.description || p.label}
                                >
                                  {isAllowed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                  {desc?.label || p.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredModules.length === 0 && (
                  <div className="py-12 text-center text-gray-500 text-xs">
                    Aucun module trouvé pour "{searchTerm}"
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
              <Shield className="w-8 h-8 mr-2 text-gray-600" />
              Sélectionnez un rôle pour gérer ses permissions
            </div>
          )}
        </div>
      </div>

      {/* Create Role Modal */}
      <AnimatePresence>
        {showCreateRole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full"
            >
              <div className="flex justify-between items-center pb-3 border-b border-gray-800 mb-4">
                <h3 className="text-base font-bold font-display text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-brand-blue" /> Créer un rôle personnalisé
                </h3>
                <button onClick={() => setShowCreateRole(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <form onSubmit={handleCreateRole} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Identifiant technique *</label>
                  <input type="text" required value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="ex: superviseur"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono"
                  />
                  <p className="text-[9px] text-gray-600 mt-1">Utilisé en interne (lettres, chiffres, underscores)</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Libellé *</label>
                  <input type="text" required value={newRoleLabel} onChange={(e) => setNewRoleLabel(e.target.value)}
                    placeholder="ex: Superviseur"
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                  <textarea value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="Décrivez les responsabilités de ce rôle..."
                    rows={3}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-brand-blue text-xs text-white rounded-xl px-3.5 py-2.5 outline-none resize-none"
                  />
                </div>
                <div className="pt-2 flex justify-end gap-2.5">
                  <button type="button" onClick={() => setShowCreateRole(false)}
                    className="px-3.5 py-2 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl">Annuler</button>
                  <button type="submit"
                    className="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-xl">Créer le rôle</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteRoleId !== null}
        title="Supprimer le rôle"
        message="Supprimer ce rôle personnalisé ?"
        confirmLabel="Supprimer"
        onConfirm={confirmDeleteRole}
        onCancel={() => setDeleteRoleId(null)}
      />
    </div>
  );
}
