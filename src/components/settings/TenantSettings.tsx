import React from 'react';
import { Building } from 'lucide-react';

interface TenantSettingsProps {
  db: any;
  activeTenantId: string;
  handleSwitchTenant: (id: string) => void;
}

export default function TenantSettings({
  db,
  activeTenantId,
  handleSwitchTenant,
}: TenantSettingsProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
      <div className="flex items-center gap-2">
        <Building className="w-4 h-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-white">Console Multi-Tenant (Boutiques Simulées)</h3>
      </div>
      <p className="text-xs text-gray-400">
        Changer instantanément de tenant pour tester la modularité SaaS. Chaque boutique isole son catalogue, ses clients, ses finances, sa taxe TVA et sa devise active.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {db.tenants.map((ten: any) => {
          const isActive = ten.id === activeTenantId;
          const prodCount = db.products.filter((p: any) => p.tenantId === ten.id).length;
          return (
            <button
              key={ten.id}
              onClick={() => handleSwitchTenant(ten.id)}
              className={`flex flex-col justify-between p-4 rounded-xl border text-left transition ${
                isActive 
                  ? 'bg-brand-blue/10 border-brand-blue/40 text-white shadow-lg' 
                  : 'bg-gray-950 border-gray-850 hover:border-gray-800 text-gray-400'
              }`}
            >
              <div className="flex items-start gap-3 mb-4">
                <img src={ten.logo} alt={ten.name} className="w-9 h-9 rounded-lg object-cover border border-gray-800 bg-gray-950 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-200">{ten.name}</p>
                  <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">{ten.description}</p>
                </div>
              </div>

              <div className="w-full flex items-center justify-between pt-3.5 border-t border-gray-850/80">
                <span className="text-[9px] bg-gray-900 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono">
                  {prodCount} produits
                </span>
                <span className="text-[9px] bg-gray-900 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono font-bold">
                  {ten.currency} / {ten.taxRate !== undefined ? `${ten.taxRate}%` : '20%'}
                </span>
                <span className={`text-[10px] font-bold uppercase ${
                  ten.plan === 'Premium' ? 'text-purple-400' : ten.plan === 'Standard' ? 'text-brand-blue' : 'text-gray-500'
                }`}>
                  {ten.plan}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
