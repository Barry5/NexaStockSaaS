import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const options = [
  { value: 'system' as const, label: 'Suivre le système', description: 'Utilise le thème du système d\'exploitation (recommandé)', icon: Monitor },
  { value: 'light' as const, label: 'Mode clair', description: 'Interface avec fond clair pour environnements lumineux', icon: Sun },
  { value: 'dark' as const, label: 'Mode sombre', description: 'Interface sombre réduisant la fatigue visuelle', icon: Moon },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/15">
          <Sun className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Apparence</h3>
          <p className="text-[10px] text-gray-400 font-mono">Personnalisez l'affichage de l'application</p>
        </div>
      </div>

      <div className="grid gap-2.5">
        {options.map(opt => {
          const Icon = opt.icon;
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-blue-600/10 border-blue-500/30 text-white shadow-sm shadow-blue-500/5'
                  : 'bg-gray-950 border-gray-850 text-gray-400 hover:bg-gray-850 hover:text-gray-200'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-bold transition-colors ${isActive ? 'text-white' : 'text-gray-200'}`}>
                  {opt.label}
                </div>
                <div className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">{opt.description}</div>
              </div>
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0 shadow-sm shadow-blue-500/30" />
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-gray-950/40 border border-gray-850 rounded-xl p-3 text-[10px] text-gray-500 leading-relaxed">
        Le thème choisi est sauvegardé et persiste après la fermeture de l'application. Il est synchronisé sur tous les onglets.
      </div>
    </div>
  );
}
