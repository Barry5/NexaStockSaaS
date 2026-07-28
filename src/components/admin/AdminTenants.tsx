import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, RefreshCw, Eye, Unlock, Power, Lock, Clock, Calendar, Trash2, Building, X, CheckCircle, FileText, Activity } from 'lucide-react';

interface AdminTenantsProps {
  filteredTenants: any[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedPlanFilter: string;
  setSelectedPlanFilter: (v: string) => void;
  showCreateModal: boolean;
  setShowCreateModal: (v: boolean) => void;
  createForm: any;
  setCreateForm: (v: any) => void;
  creating: boolean;
  createdResult: any;
  setCreatedResult: (v: any) => void;
  expiryForm: any;
  setExpiryForm: (v: any) => void;
  selectedTenantId: string | null;
  setSelectedTenantId: (v: string | null) => void;
  tenantDetail: any;
  setTenantDetail: (v: any) => void;
  tenantStats: any;
  tenantLogs: any[];
  detailLoading: boolean;
  refreshTenants: () => void;
  handleChangeTenantPlan: (tenantId: string, planName: string) => void;
  handleCreateTenant: () => void;
  handleExtendTrial: (tenantId: string, days: number) => void;
  handleModifyExpiry: () => void;
  handleDeleteTenant: (tenantId: string) => void;
  handleChangeStatus: (tenantId: string, status: string) => void;
  loadTenantDetail: (tenantId: string) => void;
}

export default function AdminTenants({
  filteredTenants,
  searchTerm,
  setSearchTerm,
  selectedPlanFilter,
  setSelectedPlanFilter,
  showCreateModal,
  setShowCreateModal,
  createForm,
  setCreateForm,
  creating,
  createdResult,
  setCreatedResult,
  expiryForm,
  setExpiryForm,
  selectedTenantId,
  setSelectedTenantId,
  tenantDetail,
  setTenantDetail,
  tenantStats,
  tenantLogs,
  detailLoading,
  refreshTenants,
  handleChangeTenantPlan,
  handleCreateTenant,
  handleExtendTrial,
  handleModifyExpiry,
  handleDeleteTenant,
  handleChangeStatus,
  loadTenantDetail,
}: AdminTenantsProps) {
  return (
    <motion.div
      key="tenants"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Entreprises Clientes du SaaS</h3>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial search-fluid">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher une entreprise..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 w-full"
            />
          </div>
          
          <select
            value={selectedPlanFilter}
            onChange={(e) => setSelectedPlanFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-red-500"
          >
            <option value="Tous">Tous les Forfaits</option>
            <option value="Free">Gratuit</option>
            <option value="Standard">Standard</option>
            <option value="Premium">Premium</option>
            <option value="Enterprise">Enterprise</option>
          </select>

          <button onClick={() => { setShowCreateModal(true); setCreatedResult(null); setCreateForm({ name: '', email: '', phone: '', address: '', city: '', country: 'Guinée', currency: 'GNF', plan: 'Free' }); }}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 btn-responsive">
            <Plus className="w-3.5 h-3.5" /> Créer
          </button>
          <button onClick={refreshTenants} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-2.5 py-1.5 rounded-lg btn-responsive"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-800 rounded-xl table-responsive">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
            <tr>
              <th className="p-3">Entreprise</th>
              <th className="p-3">Forfait</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Expire le</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-850">
            {filteredTenants.map((ten: any) => {
              const isSuspended = ten.subscriptionStatus === 'SUSPENDED' || ten.subscriptionStatus === 'EXPIRED';
              const isBlocked = ten.subscriptionStatus === 'BLOCKED';

              return (
                <tr key={ten.id} className={`hover:bg-gray-950/20 transition ${isSuspended ? 'opacity-85 bg-red-950/5' : ''} ${isBlocked ? 'opacity-60 bg-gray-950/50' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {ten.name?.[0] || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-gray-200">{ten.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{ten.email} | {ten.phone || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <select
                      value={ten.plan}
                      onChange={(e) => handleChangeTenantPlan(ten.id, e.target.value)}
                      className="bg-gray-950 border border-gray-800 text-[11px] rounded-lg px-2.5 py-1 text-gray-200 font-semibold"
                    >
                      <option value="Free">Free</option>
                      <option value="Standard">Standard</option>
                      <option value="Premium">Premium</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded-full border uppercase ${
                      ten.subscriptionStatus === 'ACTIVE'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : ten.subscriptionStatus === 'TRIAL'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : ten.subscriptionStatus === 'PENDING'
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        : ten.subscriptionStatus === 'BLOCKED'
                        ? 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      {ten.subscriptionStatus || 'TRIAL'}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-gray-600" />
                      {ten.subscriptionEndDate ? (
                        <span>{new Date(ten.subscriptionEndDate).toLocaleDateString('fr-FR')}</span>
                      ) : ten.trialEndDate ? (
                        <span>Essai: {new Date(ten.trialEndDate).toLocaleDateString('fr-FR')}</span>
                      ) : (
                        <span className="text-gray-500">N/A</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <button onClick={() => loadTenantDetail(ten.id)} className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white" title="Détails"><Eye className="w-3.5 h-3.5" /></button>

                      {ten.subscriptionStatus === 'SUSPENDED' ? (
                        <button onClick={() => handleChangeStatus(ten.id, 'ACTIVE')} className="p-1.5 hover:bg-emerald-600/20 rounded text-emerald-400" title="Réactiver"><Unlock className="w-3.5 h-3.5" /></button>
                      ) : ten.subscriptionStatus === 'BLOCKED' ? (
                        <button onClick={() => handleChangeStatus(ten.id, 'ACTIVE')} className="p-1.5 hover:bg-emerald-600/20 rounded text-emerald-400" title="Débloquer"><Power className="w-3.5 h-3.5" /></button>
                      ) : (
                        <>
                          <button onClick={() => handleChangeStatus(ten.id, 'SUSPENDED')} className="p-1.5 hover:bg-amber-600/20 rounded text-amber-400" title="Suspendre"><Power className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleChangeStatus(ten.id, 'BLOCKED')} className="p-1.5 hover:bg-red-600/20 rounded text-red-400" title="Bloquer"><Lock className="w-3.5 h-3.5" /></button>
                        </>
                      )}

                      <button onClick={() => handleExtendTrial(ten.id, 15)} className="p-1.5 hover:bg-blue-600/20 rounded text-blue-400" title="+15 jours d'essai"><Clock className="w-3.5 h-3.5" /></button>

                      <button onClick={() => { setExpiryForm({ tenantId: ten.id, endDate: ten.subscriptionEndDate?.split('T')[0] || '' }); }} className="p-1.5 hover:bg-violet-600/20 rounded text-violet-400" title="Modifier date expiration"><Calendar className="w-3.5 h-3.5" /></button>

                      <button onClick={() => handleDeleteTenant(ten.id)} className="p-1.5 hover:bg-red-600/20 rounded text-red-400" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Tenant Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-5 modal-responsive">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Building className="w-4 h-4 text-red-400" /> Nouvelle entreprise</h3>
                <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
              </div>

              {createdResult ? (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-emerald-400">Entreprise créée avec succès !</p>
                  </div>
                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-gray-400">Email admin: <span className="font-mono text-white font-bold">{createdResult.email}</span></p>
                    <p className="text-xs text-gray-400">Mot de passe: <span className="font-mono text-amber-400 font-bold">{createdResult.password}</span></p>
                    <p className="text-[10px] text-gray-500 mt-2">⚠️ Copiez ces informations. Le mot de passe ne sera plus affiché.</p>
                  </div>
                  <button onClick={() => { setShowCreateModal(false); setCreatedResult(null); }} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 rounded-lg">Fermer</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Nom de l'entreprise *</label>
                      <input value={createForm.name} onChange={e => setCreateForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="Ex: Pharmacie Centrale" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Email admin *</label>
                      <input value={createForm.email} onChange={e => setCreateForm((p: any) => ({ ...p, email: e.target.value }))} placeholder="admin@entreprise.com" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Téléphone</label>
                      <input value={createForm.phone} onChange={e => setCreateForm((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+224 ..." className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Devise</label>
                      <select value={createForm.currency} onChange={e => setCreateForm((p: any) => ({ ...p, currency: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                        <option value="GNF">GNF</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="XOF">XOF</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Adresse</label>
                      <input value={createForm.address} onChange={e => setCreateForm((p: any) => ({ ...p, address: e.target.value }))} placeholder="Adresse" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Ville</label>
                      <input value={createForm.city} onChange={e => setCreateForm((p: any) => ({ ...p, city: e.target.value }))} placeholder="Conakry" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Plan</label>
                      <select value={createForm.plan} onChange={e => setCreateForm((p: any) => ({ ...p, plan: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                        <option value="Free">Free</option><option value="Standard">Standard</option><option value="Premium">Premium</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button onClick={() => setShowCreateModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
                    <button onClick={handleCreateTenant} disabled={creating} className="bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1 btn-responsive">
                      {creating ? 'Création...' : <><Plus className="w-3.5 h-3.5" /> Créer l'entreprise</>}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expiry Modification Modal */}
      <AnimatePresence>
        {expiryForm.tenantId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-5 modal-responsive">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-400" /> Modifier date d'expiration</h3>
                <button onClick={() => setExpiryForm({ tenantId: '', endDate: '' })} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
              </div>
              <label className="text-[10px] font-mono text-gray-500 block mb-1">Nouvelle date d'expiration</label>
              <input type="date" value={expiryForm.endDate} onChange={e => setExpiryForm((p: any) => ({ ...p, endDate: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white mb-4" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setExpiryForm({ tenantId: '', endDate: '' })} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
                <button onClick={handleModifyExpiry} disabled={!expiryForm.endDate} className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg">Enregistrer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tenant Detail Drawer */}
      <AnimatePresence>
        {selectedTenantId && tenantDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 modal-responsive">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-sm font-bold text-white">{tenantDetail.name?.[0] || '?'}</div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{tenantDetail.name}</h3>
                    <p className="text-[10px] text-gray-500 font-mono">{tenantDetail.email} | {tenantDetail.phone || '-'}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedTenantId(null); setTenantDetail(null); }} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
              </div>

              {detailLoading ? (
                <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                      <p className="text-[9px] uppercase text-gray-500 font-mono">Plan</p>
                      <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.plan}</p>
                    </div>
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                      <p className="text-[9px] uppercase text-gray-500 font-mono">Statut</p>
                      <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.subscriptionStatus}</p>
                    </div>
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                      <p className="text-[9px] uppercase text-gray-500 font-mono">Date fin</p>
                      <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.subscriptionEndDate ? new Date(tenantDetail.subscriptionEndDate).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                      <p className="text-[9px] uppercase text-gray-500 font-mono">Adresse</p>
                      <p className="text-xs font-bold font-mono text-white mt-1 truncate">{tenantDetail.address || '-'}</p>
                    </div>
                  </div>

                  {tenantStats && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-300 uppercase font-mono mb-2 flex items-center gap-1"><Activity className="w-3 h-3" /> Statistiques d'utilisation</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.productCount}</p>
                          <p className="text-[9px] text-gray-500">Produits</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.saleCount}</p>
                          <p className="text-[9px] text-gray-500">Ventes</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.invoiceCount}</p>
                          <p className="text-[9px] text-gray-500">Factures</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.customerCount}</p>
                          <p className="text-[9px] text-gray-500">Clients</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.userCount}</p>
                          <p className="text-[9px] text-gray-500">Utilisateurs</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{Number(tenantStats.totalRevenue).toLocaleString()}</p>
                          <p className="text-[9px] text-gray-500">CA total</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{Number(tenantStats.totalSalesMonth).toLocaleString()}</p>
                          <p className="text-[9px] text-gray-500">CA 30j</p>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                          <p className="text-lg font-bold font-mono text-white">{tenantStats.expenseCount}</p>
                          <p className="text-[9px] text-gray-500">Dépenses</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {tenantLogs.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-300 uppercase font-mono mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Journal d'activité</h4>
                      <div className="max-h-[200px] overflow-y-auto space-y-1 bg-gray-950 rounded-xl p-2">
                        {tenantLogs.map((log: any) => (
                          <div key={log.id} className="flex items-start gap-2 text-[10px] text-gray-400 py-1 border-b border-gray-800/30 last:border-0">
                            <span className="font-mono text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleDateString('fr-FR')}</span>
                            <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[8px] font-mono text-gray-300 whitespace-nowrap">{log.action}</span>
                            <span className="flex-1">{log.details}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
