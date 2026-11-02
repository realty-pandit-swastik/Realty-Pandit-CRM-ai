export class ApiError extends Error {
  constructor(message: string, public readonly status = 0, public readonly ambiguous = false) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiOptions = RequestInit & { download?: { maxBytes: number; mimeType: string } };

async function boundedDownload(response: Response, limit: { maxBytes: number; mimeType: string }, controller: AbortController) {
  if (response.headers.get('content-type')?.split(';')[0] !== limit.mimeType) throw new ApiError('The server returned an unexpected file type.');
  const length = Number(response.headers.get('content-length'));
  if (length > limit.maxBytes) { controller.abort(); throw new ApiError('This file is too large to open on mobile.'); }
  const reader = response.body?.getReader();
  if (!reader) {
    if (!length || length > limit.maxBytes) throw new ApiError('Could not verify the download size.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit.maxBytes) throw new ApiError('This file is too large to open on mobile.');
    return bytes;
  }
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit.maxBytes) { controller.abort(); throw new ApiError('This file is too large to open on mobile.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function apiOrigin(value: string | undefined, development: boolean): string {
  if (!value) throw new ApiError('Set EXPO_PUBLIC_API_URL to your test API before signing in.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(development && local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ApiError('The API must be an HTTPS origin. Local HTTP is allowed only in development.');
  }
  return url.origin;
}

export class ApiClient {
  private accessToken: string | null = null;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  refresh: (() => Promise<void>) | null = null;
  expired: (() => Promise<void>) | null = null;

  constructor(readonly origin: string, private readonly fetcher: (url: string, options?: RequestInit) => Promise<Response> = fetch, private readonly timeoutMs = 15000) {}

  setAccessToken(token: string | null) { this.accessToken = token; }
  reset() { this.generation++; this.accessToken = null; this.refreshing = null; }

  async request(path: string, options: ApiOptions = {}, authenticated = true, retried = false): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('#')) throw new ApiError('Invalid API path.');
    const generation = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const headers = new Headers(options.headers);
    const write = !['GET', 'HEAD'].includes(options.method || 'GET');
    if (authenticated && this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      const { download, ...fetchOptions } = options;
      response = await this.fetcher(`${this.origin}${path}`, { ...fetchOptions, headers, signal: controller.signal, credentials: 'omit', redirect: 'error' });
      if (generation !== this.generation) throw new ApiError('Session changed.', 401);
      if (response.status === 401 && authenticated && !retried && this.refresh) {
        if (!this.refreshing) {
          const refreshing = this.refresh().finally(() => { if (this.refreshing === refreshing) this.refreshing = null; });
          this.refreshing = refreshing;
        }
        try { await this.refreshing; }
        catch (error) {
          if (generation === this.generation && error instanceof ApiError && error.status === 401) await this.expired?.();
          throw error;
        }
        if (generation !== this.generation) throw new ApiError('Session changed.', 401);
        return this.request(path, options, true, true);
      }
      if (response.status === 401 && authenticated) await this.expired?.();
      const data: unknown = response.status === 204 ? null : response.ok && download ? await boundedDownload(response, download, controller) : await response.json();
      if (generation !== this.generation) throw new ApiError('Session changed.', 401);
      if (!response.ok) {
        const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
        throw new ApiError(response.status >= 500 ? 'The server could not finish this request. Try again shortly.' :
          typeof error === 'string' ? error : `Request failed (${response.status}).`, response.status, write && response.status >= 500);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw new ApiError(write ? 'Transfer cancelled. Refresh the record to check whether the server received it.' : 'Request cancelled.', 0, write);
      throw new ApiError(timedOut ? (write ? 'Save outcome unknown. Refresh the record before trying again.' : 'Request timed out. Check your connection and retry.') :
        (write ? 'Connection interrupted. Check the current record before trying again.' : 'Could not connect. Check your connection and retry.'), 0, write);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Unexpected server response.');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('Unexpected server response.');
  return value;
}
export function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : string(value);
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ApiError('Unexpected server response.');
  return value;
}
export function array<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new ApiError('Unexpected server response.');
  return value.map(parse);
}
