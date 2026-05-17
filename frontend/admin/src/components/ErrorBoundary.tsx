/**
 * Phase 7: Cyberpunk Error Boundary
 * Prevents white screen of death during live demos.
 */
import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Crash intercepted:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[99999] font-mono">
          <div className="max-w-lg text-center">
            <div className="text-red-500 text-6xl mb-6 animate-pulse">⚠</div>
            <h1 className="text-2xl font-bold text-red-500 tracking-widest uppercase mb-4">
              SİSTEM KİLİTLENDİ
            </h1>
            <div className="bg-zinc-950 border border-red-500/30 rounded-xl p-6 mb-6 text-left">
              <p className="text-[11px] text-gray-500 mb-2">CRASH_DUMP:</p>
              <p className="text-red-400 text-sm break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <p className="text-gray-500 text-sm mb-6">
              GÜVENLİ YENİDEN BAŞLATMA prosedürü hazır.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors tracking-wider uppercase text-sm shadow-[0_0_30px_rgba(239,68,68,0.3)]"
            >
              GÜVENLİ YENİDEN BAŞLAT
            </button>
          </div>
          <div className="absolute bottom-8 text-[9px] text-gray-700 font-mono">
            TRIAGE_V2 // KERNEL_PANIC_HANDLER // {new Date().toISOString()}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
