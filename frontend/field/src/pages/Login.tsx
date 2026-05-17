/**
 * TRIAGE — Field Login Page
 *
 * Simple placeholder login for field devices.
 * Saves a dummy JWT token to localStorage.
 * Will be replaced with real API authentication in Phase 2.
 */

import { useState, type FormEvent } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!teamName.trim()) {
      setError('Ekip adı gereklidir.');
      return;
    }

    setLoading(true);

    // Simulate API delay
    await new Promise((r) => setTimeout(r, 600));

    // Save dummy token — will be replaced with real JWT from /api/v1/auth/register-device
    const dummyToken = btoa(JSON.stringify({
      sub: `FIELD-${Date.now()}`,
      device_name: teamName,
      role: 'field_worker',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }));

    localStorage.setItem('auth_token', dummyToken);
    localStorage.setItem('device_name', teamName);
    localStorage.setItem('device_role', 'field_worker');

    setLoading(false);
    onLogin();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-blue-600/20 border border-emerald-500/30 mb-4">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">TRIAGE</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono uppercase tracking-widest">Saha Ekibi Girişi</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 space-y-5 backdrop-blur-sm">
          <div>
            <label htmlFor="field-team-name" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Ekip Adı
            </label>
            <input
              id="field-team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Ekip Alfa 1"
              autoComplete="username"
              className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white text-lg placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
            />
          </div>


          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            id="field-login-button"
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-base"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Bağlanıyor…
              </span>
            ) : (
              'Göreve Başla'
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
