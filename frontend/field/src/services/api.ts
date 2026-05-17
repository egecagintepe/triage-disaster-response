/**
 * TRIAGE — REST API Client (Field)
 *
 * Thin wrapper around fetch() for communicating with the FastAPI backend.
 * Used by the sync queue to push offline changes.
 *
 * The base URL defaults to the LAN master node but can be overridden
 * via VITE_API_URL environment variable.
 */

export const getApiBase = (): string => {
  // Priority 1: User-configured server URL from localStorage
  const savedUrl = localStorage.getItem('triage_server_ip');
  if (savedUrl) {
    // Clean trailing slashes
    const clean = savedUrl.replace(/\/+$/, '');
    // If user entered a full URL (http:// or https://), use as-is
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    // Bare IP/hostname — assume http with port 8000
    return `http://${clean}`;
  }

  // Priority 2: env var
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  // Priority 3: Same-origin detection (production deployment)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    if (protocol === 'https:') {
      return `https://${hostname}`;
    }
    return `http://${hostname}:8000`;
  }

  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
};

export const getWsBase = (): string => {
  // Derive WS URL from the API base — ensures protocol consistency
  const apiBase = getApiBase();
  const cleanBase = apiBase.replace(/\/+$/, '');

  // Determine if secure
  const isSecure = cleanBase.startsWith('https://');

  // Strip HTTP(S) protocol to get raw host[:port]
  const host = cleanBase.replace(/^https?:\/\//, '');

  // Map to correct WS protocol
  const wsProtocol = isSecure ? 'wss://' : 'ws://';

  return `${wsProtocol}${host}`;
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

