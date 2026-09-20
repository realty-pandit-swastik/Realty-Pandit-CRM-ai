/**
 * Centralized API Configuration & Client
 * Auth is handled via HttpOnly cookies (set by the server on login).
 * The CSRF token is read from the readable rp_csrf cookie and injected
 * as an X-CSRF-Token header for all state-changing requests.
 */

// API Base URL from environment variable
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Read the CSRF token from the rp_csrf cookie (intentionally not HttpOnly). */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)rp_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Cookie-aware fetch wrapper.
 * - Always sends credentials (HttpOnly auth cookies)
 * - Injects X-CSRF-Token for non-safe methods
 * - Dispatches 'session-expired' event on 401
 */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (!SAFE_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(url, { ...options, credentials: 'include', headers });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('session-expired'));
  }

  return res;
}

/**
 * Cookie-aware API client (replaces token-based ApiClient).
 * Uses authedFetch internally — no token required.
 */
export class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /** @deprecated Token is no longer used — auth is via HttpOnly cookie. No-op. */
  setToken(token: string | null) { void token; }

  async get<T = any>(endpoint: string): Promise<T> {
    const response = await authedFetch(`${this.baseURL}${endpoint}`, { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async post<T = any>(endpoint: string, data: any): Promise<T> {
    const response = await authedFetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async patch<T = any>(endpoint: string, data: any): Promise<T> {
    const response = await authedFetch(`${this.baseURL}${endpoint}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    const response = await authedFetch(`${this.baseURL}${endpoint}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

// Export a singleton instance
export const apiClient = new ApiClient();
