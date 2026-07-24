import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<Props> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if ((this as any).state.hasError) {
      if ((this as any).props.fallback) {
        return (this as any).props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-gray-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-400 mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-black font-display uppercase tracking-wide text-white">
                  Une erreur est survenue
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  L'application a rencontré un problème inattendu. Veuillez réessayer.
                </p>
              </div>
            </div>

            {(this as any).state.error && (
              <div className="bg-gray-950 border border-gray-800 p-4 rounded-2xl">
                <p className="text-[11px] font-mono text-red-400 break-all leading-relaxed">
                  {(this as any).state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/15"
              >
                <RefreshCw className="w-4 h-4" /> Réessayer
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Home className="w-4 h-4" /> Recharger
              </button>
            </div>

            <p className="text-[10px] text-gray-600 font-mono text-center">
              Si le problème persiste, contactez le support technique.
            </p>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
