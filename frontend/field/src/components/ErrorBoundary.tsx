import React from 'react';

interface State { hasError: boolean; error: Error | null; }

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
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[99999] font-mono p-8">
          <div className="text-red-500 text-5xl mb-4 animate-pulse">⚠</div>
          <h1 className="text-xl font-bold text-red-500 tracking-widest uppercase mb-3">
            SİSTEM KİLİTLENDİ
          </h1>
          <p className="text-red-400 text-xs mb-6 text-center break-all max-w-xs">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg text-sm uppercase tracking-wider"
          >
            GÜVENLİ YENİDEN BAŞLAT
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
