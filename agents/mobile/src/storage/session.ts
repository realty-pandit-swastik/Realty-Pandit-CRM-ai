import * as SecureStore from 'expo-secure-store';
import { ApiClient, ApiError } from '../api/client';
import { ActiveSession, sessionFrom } from '../api/contracts';

export interface CredentialStore { get(): Promise<string | null>; set(value: string): Promise<void>; clear(): Promise<void> }
export function secureCredentials(origin: string): CredentialStore {
  const key = `rp.mobile.${Array.from(origin).map(character => character.charCodeAt(0).toString(16)).join('')}`;
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return { get: () => SecureStore.getItemAsync(key, options), set: value => SecureStore.setItemAsync(key, value, options), clear: () => SecureStore.deleteItemAsync(key, options) };
}

export class SessionController {
  current: ActiveSession | null = null;
  private generation = 0;
  private restoring: Promise<ActiveSession | null> | null = null;
  private credentialWrite = Promise.resolve();
  onChange: (session: ActiveSession | null) => void = () => {};
  constructor(readonly api: ApiClient, private readonly credentials: CredentialStore, private readonly clearCache: () => void | Promise<void>) {
    api.refresh = async () => { await this.restore(); };
    api.expired = () => this.clear();
  }

  private store(action: () => Promise<void>) {
    const write = this.credentialWrite.then(action);
    this.credentialWrite = write.catch(() => {});
    return write;
  }

  private async adopt(value: unknown, generation: number) {
    const session = sessionFrom(value);
    if (generation !== this.generation) throw new ApiError('Session changed.', 401);
    try { await this.store(async () => {
      if (generation !== this.generation) throw new ApiError('Session changed.', 401);
      await this.credentials.set(session.refreshToken);
    }); }
    catch {
      if (generation !== this.generation) throw new ApiError('Session changed.', 401);
      await this.api.request(`/auth/mobile/sessions/${encodeURIComponent(session.sessionId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` },
      }, false).catch(() => {});
      if (generation === this.generation) await this.clear();
      throw new ApiError('Could not save your secure session. Check device storage and sign in again.');
    }
    if (generation !== this.generation) throw new ApiError('Session changed.', 401);
    const changedIdentity = this.current && (this.current.agent.id !== session.agent.id || this.current.agent.tenant_id !== session.agent.tenant_id || this.current.agent.role !== session.agent.role);
    if (changedIdentity) { this.api.reset(); await this.clearCache(); }
    if (generation !== this.generation) throw new ApiError('Session changed.', 401);
    const { refreshToken: _refreshToken, ...active } = session;
    this.current = active;
    this.api.setAccessToken(session.token);
    this.onChange(active);
    return active;
  }

  async login(phone: string, password: string, deviceName: string) {
    const generation = this.generation;
    return this.adopt(await this.api.request('/auth/mobile/login', { method: 'POST', body: JSON.stringify({ phone, password, deviceName }) }, false), generation);
  }

  restore() {
    if (!this.restoring) {
      const restoring = this.restoreOnce().finally(() => { if (this.restoring === restoring) this.restoring = null; });
      this.restoring = restoring;
    }
    return this.restoring;
  }

  private async restoreOnce() {
    const generation = this.generation;
    const refreshToken = await this.credentials.get();
    if (!refreshToken) return null;
    try {
      const value = await this.api.request('/auth/mobile/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false);
      return await this.adopt(value, generation);
    } catch (error) {
      if (generation === this.generation && error instanceof ApiError && error.status === 401) await this.clear();
      throw error;
    }
  }

  async logout() {
    if (this.current) await this.api.request(`/auth/mobile/sessions/${encodeURIComponent(this.current.sessionId)}`, { method: 'DELETE' });
    await this.clear();
  }

  async clear() {
    this.generation++;
    this.restoring = null;
    this.api.reset();
    this.current = null;
    this.onChange(null);
    await Promise.all([this.store(() => this.credentials.clear()), Promise.resolve().then(() => this.clearCache())]);
  }
}
