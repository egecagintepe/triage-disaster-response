/**
 * TRIAGE — Admin Login Page
 *
 * Simple placeholder login that saves a dummy JWT token to localStorage.
 * Will be replaced with real API authentication in Phase 2.
 */

import { useState, type FormEvent } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!deviceName.trim()) {
      setError('Cihaz adı gereklidir.');
      return;
    }

    setLoading(true);

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 600));

    // Save dummy token — will be replaced with real JWT from /api/v1/auth/register-device
    const dummyToken = btoa(JSON.stringify({
      sub: `ADMIN-${Date.now()}`,
      device_name: deviceName,
      role: 'admin',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }));

    localStorage.setItem('auth_token', dummyToken);
    localStorage.setItem('device_name', deviceName);
    localStorage.setItem('device_role', 'admin');

    setLoading(false);
    onLogin();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-red-600/20 border border-amber-500/30 mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">TRIAGE</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono uppercase tracking-widest">Komuta Merkezi Girişi</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-5 backdrop-blur-sm">
          <div>
            <label htmlFor="admin-device-name" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Cihaz / Operatör Adı
            </label>
            <input
              id="admin-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Komuta-Merkez-01"
              autoComplete="username"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-colors"
            />
          </div>


          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            id="admin-login-button"
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Bağlanıyor…
              </span>
            ) : (
              'Sisteme Giriş'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6 font-mono">
          v0.1.0 — Offline-First Afet Yönetim Sistemi
        </p>
      </div>
    </div>
  );
}
