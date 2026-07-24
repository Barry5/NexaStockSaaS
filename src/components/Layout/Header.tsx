import { motion } from 'motion/react';
import { Bell, Database, Cloud, CloudLightning, CloudOff, Shield } from 'lucide-react';
import { useDB, useApp } from '../../context';

export function Header() {
  const { db, isSyncing, syncError, isOnline, lastCacheTime, notifications } = useDB();
  const { activeTenant, activeUser, activeTenantId, handleSwitchTenant } = useApp();

  return (
    <header className="hidden lg:flex h-16 border-b border-gray-850 px-6 items-center justify-between bg-gray-900/40 backdrop-blur-md sticky top-0 z-35">
      <div className="flex items-center gap-3">
        {activeUser?.role === 'superadmin' ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 font-mono flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 px-2.5 py-1 rounded-full">
              <Shield className="w-3.5 h-3.5" /> Superviseur Plateforme
            </span>
            <span className="text-gray-700 font-mono">|</span>
            <div className="flex items-center gap-2 bg-gray-950 border border-gray-850 px-3 py-1.5 rounded-xl shadow-inner">
              <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">Organisation inspectée :</span>
              <select
                value={activeTenantId}
                onChange={(e) => handleSwitchTenant(e.target.value)}
                className="bg-transparent text-xs font-sans font-bold text-white focus:outline-none cursor-pointer border-none p-0 pr-6"
              >
                {db.tenants.map(t => (
                  <option key={t.id} value={t.id} className="bg-gray-900 text-white font-sans font-bold">
                    {t.name} (Plan {t.plan})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black font-display text-white tracking-wide uppercase">
              {activeTenant?.name}
            </h2>
            <span className="text-gray-700">/</span>
            <span className="text-xs font-semibold text-gray-400 bg-gray-950 px-2.5 py-1 rounded-lg border border-gray-850 capitalize font-mono">
              {activeTenant?.name ? 'Tableau de bord' : 'Paramètres'}
            </span>
          </div>
        )}

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono select-none transition-all duration-300 ${
          isOnline
            ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/15 text-amber-400 animate-pulse'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
          <span>{isOnline ? 'Internet : Connecté' : 'Mode Hors-Ligne (Offline)'}</span>
        </div>

        <div
          className="flex items-center gap-1.5 bg-gray-950 px-2.5 py-1 rounded-full border border-gray-850 text-[10px] font-mono select-none"
          title={`Données persistées dans localStorage. Dernier : ${lastCacheTime || 'Inconnu'}`}
        >
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-gray-400">Cache : <span className="text-cyan-400 font-bold uppercase">Persistant</span></span>
          {lastCacheTime && (
            <span className="text-[9px] text-gray-500 font-normal">({lastCacheTime})</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-gray-950 px-2.5 py-1 rounded-full border border-gray-850 text-[10px] font-mono">
          {isSyncing ? (
            <>
              <CloudLightning className="w-3.5 h-3.5 text-blue-500 animate-bounce" />
              <span className="text-blue-500">Synchro Cloud...</span>
            </>
          ) : syncError ? (
            <>
              <CloudOff className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400">Non synchronisé</span>
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold font-sans">SaaS Cloud</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative group cursor-pointer">
          <div className="bg-gray-800 hover:bg-gray-750 p-2 rounded-xl transition relative">
            <Bell className="w-4 h-4 text-gray-400 group-hover:text-white" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </div>
          <div className="absolute right-0 mt-2.5 w-64 bg-gray-900 border border-gray-850 rounded-xl shadow-xl p-3 hidden group-hover:block z-50 text-xs">
            <p className="font-bold text-gray-300 pb-1.5 border-b border-gray-800 mb-2">Audit d'exploitation récent</p>
            {notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map(not => (
                  <div key={not.id} className="text-[10px] text-gray-400 font-mono border-l-2 border-blue-500 pl-2 py-0.5">
                    <p className="text-gray-200 font-sans leading-normal">{not.text}</p>
                    <p className="text-gray-500 mt-0.5">{not.time}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic text-center py-4">Aucun événement à signaler.</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-l border-gray-850 pl-4">
          <div className="text-right">
            <p className="text-xs font-bold text-gray-200">{activeUser?.name || 'Collaborateur'}</p>
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-wider font-bold text-blue-400">{activeUser?.role}</p>
          </div>
          {activeUser?.avatar ? (
            <img src={activeUser.avatar} alt={activeUser.name} className="w-8 h-8 rounded-full border border-gray-800 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-xs text-blue-400">
              {activeUser?.name[0] || 'U'}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
