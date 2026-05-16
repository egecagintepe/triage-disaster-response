/**
 * TRIAGE — REST API Client (Field)
 *
 * Thin wrapper around fetch() for communicating with the FastAPI backend.
 * Used by the sync queue to push offline changes.
 *
 * URL resolution priority:
 *   1. localStorage 'triage_server_ip' (user override from Settings)
 *   2. VITE_API_URL environment variable
 *   3. Same-origin detection (LAN/Network access)
 *   4. Fallback: https://saha.gokberkceviker.com.tr
 */

export const getApiBase = (): string => {
  // Priority 1: User override via Settings panel
  const savedIp = localStorage.getItem('triage_server_ip');
  if (savedIp) {
    // If user saved a full URL, use as-is; otherwise wrap with http://
    return savedIp.startsWith('http') ? savedIp : `http://${savedIp}`;
  }

  // Priority 2: Build-time env var
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:8000`;
    }
  }

  // Priority 4: Production fallback
  return 'https://saha.gokberkceviker.com.tr';
};

export const getWsBase = (): string => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  const base = getApiBase();
  // Proper protocol mapping: https → wss, http → ws
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? base.replace(/^http:/, 'wss:').replace(/^https:/, 'wss:')
    : base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
};

let isRefreshing = false;

async function request<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const token = localStorage.getItem('auth_token');

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // 401 Interceptor: attempt silent token refresh + retry once
  if (res.status === 401 && !_isRetry && token && !isRefreshing) {
    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${getApiBase()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (refreshRes.ok) {
        const { access_token } = await refreshRes.json();
        localStorage.setItem('auth_token', access_token);
        console.log('[API] Token refreshed successfully');
        return request<T>(path, options, true);
      }
    } catch (e) {
      console.error('[API] Token refresh failed:', e);
    } finally {
      isRefreshing = false;
    }
    // Refresh failed — clear token
    localStorage.removeItem('auth_token');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),

  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

