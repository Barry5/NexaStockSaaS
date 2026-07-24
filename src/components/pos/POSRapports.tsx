import { motion } from 'motion/react';
import {
  TrendingUp, Coins, Calendar, ShoppingBag
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';

interface POSRapportsProps {
  currency: string;
  reportsData: {
    stats: {
      totalSales: number;
      totalProfit: number;
      unpaidDebts: number;
      salesCount: number;
    };
    trendsList: { date: string; ventes: number; profit: number }[];
    bestSellersList: { name: string; qty: number; totalRev: number }[];
    paymentShares: { name: string; value: number }[];
  };
}

export default function POSRapports(props: POSRapportsProps) {
  const { currency, reportsData } = props;

  return (
    <motion.div
      key="pos-rapports"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Quick KPI stats blocks */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase block">CHIFFRE D'AFFAIRES</span>
            <span className="text-base font-black font-mono text-white">
              {reportsData.stats.totalSales.toLocaleString()} <span className="text-xs text-gray-400">{currency}</span>
            </span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase block">MARGE / BÉNÉFICE NET</span>
            <span className="text-base font-black font-mono text-white">
              {reportsData.stats.totalProfit.toLocaleString()} <span className="text-xs text-gray-400">{currency}</span>
            </span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase block">CRÉANCES CLIENTS</span>
            <span className="text-base font-black font-mono text-white">
              {reportsData.stats.unpaidDebts.toLocaleString()} <span className="text-xs text-gray-400">{currency}</span>
            </span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-850 p-4.5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase block">TRANSACTIONS ENREGISTRÉES</span>
            <span className="text-base font-black font-mono text-white">
              {reportsData.stats.salesCount} <span className="text-xs text-gray-400">ventes</span>
            </span>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Trend Chart */}
        <div className="bg-gray-900 border border-gray-850 p-5 rounded-2xl space-y-4">
          <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">
            📈 ÉVOLUTION TEMPORELLE DU CA & PROFITS
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reportsData.trendsList}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1f2937', color: '#fff' }} />
                <Area type="monotone" dataKey="ventes" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSales)" name="Ventes (CA)" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={0} name="Profit Net" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Shares Payment Methods */}
        <div className="bg-gray-900 border border-gray-850 p-5 rounded-2xl space-y-4">
          <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">
            💳 VENTILATION PAR MODES DE RÈGLEMENT
          </h4>
          <div className="h-64 flex flex-col sm:flex-row items-center justify-around gap-4">
            {reportsData.paymentShares.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Données insuffisantes pour générer les graphiques.</p>
            ) : (
              <>
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportsData.paymentShares}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {reportsData.paymentShares.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 4]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${(value as number).toLocaleString()} ${currency}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  {reportsData.paymentShares.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][idx % 4] }}></span>
                      <span className="text-gray-400">{item.name} :</span>
                      <span className="text-white font-bold">{item.value.toLocaleString()} {currency}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Best Sellers and performance */}
      <div className="bg-gray-900 border border-gray-850 p-5 rounded-2xl space-y-4">
        <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">
          🥇 PALMARÈS DES MEILLEURS PRODUITS (BEST-SELLERS)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="space-y-2">
            {reportsData.bestSellersList.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-6">Aucun produit vendu pour l'instant.</p>
            ) : (
              reportsData.bestSellersList.map((prod, idx) => (
                <div key={idx} className="flex justify-between items-center bg-gray-950 border border-gray-850 p-3 rounded-xl text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="text-white font-bold">{prod.name}</p>
                      <p className="text-gray-500 text-[10px]">{prod.qty} pièces vendues</p>
                    </div>
                  </div>
                  <span className="text-white font-bold">{prod.totalRev.toLocaleString()} {currency}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-gray-950 border border-gray-850 p-4.5 rounded-2xl flex flex-col justify-center space-y-3.5">
            <h5 className="text-[11px] font-bold text-gray-400 uppercase font-mono tracking-wider flex items-center gap-1">
              🎯 RATIO DE PERFORMANCE COMMERCIAL
            </h5>
            <p className="text-xs text-gray-400 leading-relaxed">
              Vos ventes sont principalement alimentées par vos produits phares. Surveillez vos seuils d'alertes dans le module de Réapprovisionnement IA pour éviter toute rupture de stock de vos 5 meilleurs produits.
            </p>
            <div className="pt-2">
              <button
                onClick={() => alert("Simulation d'export PDF en cours... Votre rapport global est prêt à être partagé.")}
                className="bg-blue-600 hover:bg-blue-500 transition text-white text-xs font-mono font-bold px-4 py-2 rounded-xl shadow-lg shadow-blue-500/15"
              >
                Exporter le journal des ventes complet (Excel/PDF)
              </button>
            </div>
          </div>

        </div>
      </div>

    </motion.div>
  );
}
