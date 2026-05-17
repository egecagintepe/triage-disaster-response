/**
 * TRIAGE — REST API Client (Admin)
 *
 * Thin wrapper around fetch() for communicating with the FastAPI backend.
 * Used by the sync queue to push offline changes.
 *
 * The base URL defaults to the LAN master node but can be overridden
 * via VITE_API_URL environment variable.
 */

const getApiBase = () => {
  // Always use relative paths so that the browser automatically handles HTTP vs HTTPS,
  // and routes requests through either the Vite proxy (dev) or Nginx Proxy Manager (prod).
  return '';
};

export const API_BASE_URL = getApiBase();

let isRefreshing = false;

async function request<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const token = localStorage.getItem('auth_token');

  const res = await fetch(`${API_BASE_URL}${path}`, {
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
      const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
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

/** WebSocket base URL (derived dynamically from current host) */
export const WS_BASE = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:8000';
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';

  if (loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
    if (protocol === 'wss:') {
      return `wss://${loc.hostname}`;
    }
    return `ws://${loc.hostname}:8000`;
  }

  return import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
})();
