import React from 'react';
import {
  Building,
  Check,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

interface BackupSettingsProps {
  isBackupAdmin: boolean;
  backupLoading: boolean;
  backupList: any[];
  backupLabel: string;
  setBackupLabel: (v: string) => void;
  backupStrategy: string;
  setBackupStrategy: (v: any) => void;
  handleCreateBackup: () => void;
  localRestoring: boolean;
  localRestoreConfirm: string | null;
  setLocalRestoreConfirm: (v: string | null) => void;
  handleLocalRestore: (manifestPath: string) => void;
  gdriveConnected: boolean;
  setGdriveConnected: (v: boolean) => void;
  gdriveEmail: string | null;
  setGdriveEmail: (v: string | null) => void;
  gdriveBackups: any[];
  setGdriveBackups: (v: any[] | ((prev: any[]) => any[])) => void;
  gdriveLoading: boolean;
  gdriveRestoring: boolean;
  setGdriveRestoring: (v: boolean) => void;
  gdriveRestoreSteps: string[];
  setGdriveRestoreSteps: (v: string[] | ((prev: string[]) => string[])) => void;
  gdriveRestoreDone: boolean;
  setGdriveRestoreDone: (v: boolean) => void;
  gdriveSelectedBackup: any | null;
  setGdriveSelectedBackup: (v: any | null) => void;
  gdriveTenantId: string;
  setGdriveTenantId: (v: string) => void;
  handleGdriveConnect: () => void;
  handleGdriveDisconnect: () => void;
  handleGdriveUpload: () => void;
  handleLoadGdriveBackups: () => void;
  handleGdriveRestore: () => void;
  isSuperAdmin: boolean;
  db: any;
}

export default function BackupSettings({
  isBackupAdmin,
  backupLoading,
  backupList,
  backupLabel,
  setBackupLabel,
  backupStrategy,
  setBackupStrategy,
  handleCreateBackup,
  localRestoring,
  localRestoreConfirm,
  setLocalRestoreConfirm,
  handleLocalRestore,
  gdriveConnected,
  setGdriveConnected,
  gdriveEmail,
  setGdriveEmail,
  gdriveBackups,
  setGdriveBackups,
  gdriveLoading,
  gdriveRestoring,
  setGdriveRestoring,
  gdriveRestoreSteps,
  setGdriveRestoreSteps,
  gdriveRestoreDone,
  setGdriveRestoreDone,
  gdriveSelectedBackup,
  setGdriveSelectedBackup,
  gdriveTenantId,
  setGdriveTenantId,
  handleGdriveConnect,
  handleGdriveDisconnect,
  handleGdriveUpload,
  handleLoadGdriveBackups,
  handleGdriveRestore,
  isSuperAdmin,
  db,
}: BackupSettingsProps) {
  return (
    <>
      {/* LOCAL BACKUP */}
      <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Sauvegarde locale</h3>
            <p className="text-xs text-gray-400 mt-0.5">AES-256 · SHA-256 · stockée sur le serveur</p>
          </div>
          {!isBackupAdmin && <span className="text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 rounded-lg uppercase">Accès restreint</span>}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Libellé</label>
              <input value={backupLabel} onChange={e => setBackupLabel(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Stratégie</label>
              <select value={backupStrategy} onChange={e => setBackupStrategy(e.target.value as any)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white">
                <option value="full">Complète</option>
                <option value="incremental">Incrémentale</option>
                <option value="differential">Différentielle</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleCreateBackup} disabled={backupLoading || !isBackupAdmin} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />{backupLoading ? 'Création...' : 'Sauvegarder maintenant'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {backupList.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Aucune sauvegarde locale.</p>
            ) : backupList.map(item => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-gray-800 bg-gray-950 p-3 gap-2">
                <div>
                  <p className="text-xs font-semibold text-white">{item.label}</p>
                  <p className="text-[10px] text-gray-500">{new Date(item.createdAt).toLocaleString('fr-FR')} · {item.strategy}</p>
                </div>
                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-gray-800">{item.encrypted ? 'Chiffrée' : 'Non chiffrée'}</span>
                  <span>{Math.round((item.size || 0) / 1024)} KB</span>
                  {isBackupAdmin && (
                    <>
                      {localRestoreConfirm === item.manifestPath ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleLocalRestore(item.manifestPath)} disabled={localRestoring} className="text-[10px] bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded transition">{localRestoring ? '...' : 'Confirmer'}</button>
                          <button onClick={() => setLocalRestoreConfirm(null)} className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition">Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => setLocalRestoreConfirm(item.manifestPath)} className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition">Restaurer</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GOOGLE DRIVE BACKUP */}
      <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.65 7.2z" fill="#0066da"/>
              <path d="M43.65 25L29.9 1.2a15.92 15.92 0 00-3.3 3.3L1.65 45.5A15.92 15.92 0 000 52.7h27.5z" fill="#00ac47"/>
              <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.65-7.2H59.8l5.85 11.2z" fill="#ea4335"/>
              <path d="M43.65 25L57.4 1.2C56.05.43 54.5 0 52.85 0H34.45c-1.65 0-3.2.43-4.55 1.2z" fill="#00832d"/>
              <path d="M59.8 52.7H27.5L13.75 76.5c1.35.77 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.43 4.55-1.2z" fill="#2684fc"/>
              <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 27.7h27.45a15.92 15.92 0 00-1.65-7.2z" fill="#ffba00"/>
            </svg>
            <h3 className="text-sm font-bold text-white">Sauvegarde Google Drive</h3>
          </div>
          {gdriveConnected && (
            <span className="text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg flex items-center gap-1">
              <Check className="w-3 h-3" /> Connecté
            </span>
          )}
        </div>
        <div className="p-5 space-y-5">

          {/* Tenant selector for superadmin */}
          {isSuperAdmin && (
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
              <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <select
                value={gdriveTenantId}
                onChange={(e) => { setGdriveTenantId(e.target.value); setGdriveConnected(false); setGdriveEmail(null); setGdriveBackups([]); setGdriveSelectedBackup(null); setGdriveRestoreDone(false); }}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="__superadmin__">Super Admin (Drive global)</option>
                {db.tenants.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Connection card */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {gdriveConnected ? (
                <>
                  <p className="text-xs font-bold text-white">Compte connecté</p>
                  <p className="text-[11px] text-emerald-400 font-mono mt-0.5">{gdriveEmail}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">État : Connecté ✓</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-white">Non connecté</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Connectez votre compte Google pour activer la sauvegarde distante.</p>
                </>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {!gdriveConnected ? (
                <button onClick={handleGdriveConnect} disabled={!isBackupAdmin} className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-800 text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 shadow">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Connecter Google Drive
                </button>
              ) : (
                <button onClick={handleGdriveDisconnect} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-2 rounded-xl transition">
                  Déconnecter
                </button>
              )}
            </div>
          </div>

          {gdriveConnected && (
            <>
              {/* Upload controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input value={backupLabel} onChange={e => setBackupLabel(e.target.value)} placeholder="Libellé de la sauvegarde" className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white" />
                <select value={backupStrategy} onChange={e => setBackupStrategy(e.target.value as any)} className="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white">
                  <option value="full">Complète</option>
                  <option value="incremental">Incrémentale</option>
                  <option value="differential">Différentielle</option>
                </select>
                <button onClick={handleGdriveUpload} disabled={gdriveLoading || !isBackupAdmin} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 whitespace-nowrap">
                  <ShieldCheck className="w-3.5 h-3.5" />{gdriveLoading ? 'Envoi...' : 'Sauvegarder maintenant'}
                </button>
              </div>

              {/* Restore section */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white">Restaurer depuis Google Drive</h4>
                  <button onClick={handleLoadGdriveBackups} disabled={gdriveLoading} className="text-[10px] text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Actualiser
                  </button>
                </div>

                {gdriveBackups.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">Aucune sauvegarde trouvée. Cliquez sur Actualiser.</p>
                ) : (
                  <div className="table-responsive"><table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-500 uppercase font-mono border-b border-gray-800">
                        <th className="text-left pb-2 pr-4">Date</th>
                        <th className="text-left pb-2 pr-4">Taille</th>
                        <th className="text-left pb-2 pr-4">Version</th>
                        <th className="text-left pb-2">Type</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {gdriveBackups.map((b: any) => (
                        <tr
                          key={b.id}
                          className="cursor-pointer transition"
                          onClick={() => { setGdriveSelectedBackup(b); setGdriveRestoring(false); setGdriveRestoreDone(false); setGdriveRestoreSteps([]); }}
                        >
                          <td className="py-2 pr-4 text-gray-300">{new Date(b.createdAt).toLocaleString('fr-FR')}</td>
                          <td className="py-2 pr-4 text-gray-400">{Math.round((b.driveSize || b.size || 0) / (1024 * 1024))} Mo</td>
                          <td className="py-2 pr-4 text-gray-400 font-mono">v{b.version || '1'}</td>
                          <td className="py-2"><span className="text-[9px] font-mono bg-gray-800 px-2 py-0.5 rounded uppercase text-gray-300">{b.strategy || 'full'}</span></td>
                          <td className="py-2 text-right">{gdriveSelectedBackup?.id === b.id && <Check className="w-3.5 h-3.5 text-blue-400 inline" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}

                {/* Selected backup confirm */}
                {gdriveSelectedBackup && !gdriveRestoring && !gdriveRestoreDone && (
                  <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-blue-400">Sauvegarde sélectionnée</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                      <div><span className="text-gray-500">Date :</span> <span className="text-white font-mono">{new Date(gdriveSelectedBackup.createdAt).toLocaleString('fr-FR')}</span></div>
                      <div><span className="text-gray-500">Version :</span> <span className="text-white font-mono">v{gdriveSelectedBackup.version || '1'}</span></div>
                      <div><span className="text-gray-500">Taille :</span> <span className="text-white font-mono">{Math.round((gdriveSelectedBackup.driveSize || gdriveSelectedBackup.size || 0) / (1024 * 1024))} Mo</span></div>
                      <div><span className="text-gray-500">Type :</span> <span className="text-white font-mono capitalize">{gdriveSelectedBackup.strategy || 'Complète'}</span></div>
                    </div>
                    <p className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">⚠ Cette opération remplacera la base de données actuelle.</p>
                    <p className="text-[11px] text-gray-300 font-medium">Voulez-vous restaurer cette sauvegarde ?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setGdriveSelectedBackup(null)} className="flex-1 text-xs text-gray-400 border border-gray-700 hover:bg-gray-800 px-4 py-2.5 rounded-xl transition">Annuler</button>
                      <button onClick={handleGdriveRestore} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">Restaurer</button>
                    </div>
                  </div>
                )}

                {/* Restore progress */}
                {gdriveRestoring && !gdriveRestoreDone && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-white flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" /> Restauration en cours...
                    </p>
                    <div className="space-y-2 font-mono text-xs">
                      {['Produits', 'Clients', 'Ventes', 'Stock', 'Paiements'].map(step => (
                        <div key={step} className="flex items-center gap-3">
                          <span className="text-gray-400 w-24">{step}</span>
                          <span className="flex-1 text-gray-700 tracking-widest">··········</span>
                          {gdriveRestoreSteps.includes(step)
                            ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            : <div className="w-3.5 h-3.5 rounded-full border border-gray-600 animate-pulse flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Restore done */}
                {gdriveRestoreDone && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-3 text-center">
                    <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm font-bold text-white">✓ Restauration terminée</p>
                    <p className="text-xs text-gray-400">Les données ont été restaurées avec succès.</p>
                    <p className="text-xs text-gray-500">Redémarrer l'application ?</p>
                    <button onClick={() => window.location.reload()} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition">
                      Redémarrer
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
