import { ApiClient, ApiError } from '../api/client';
import { SessionController, CredentialStore } from './session';
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'local' }));

const session = { token: 'synthetic-access', refreshToken: 'synthetic-refresh', sessionId: 'synthetic-session', agent: {
  id: 'synthetic-member', tenant_id: 'synthetic-tenant', name: 'Synthetic', email: 'synthetic@example.invalid', role: 'employee', permissions: ['view_inventory'],
} };
function setup() {
  let stored: string | null = null;
  const credentials: CredentialStore = { get: jest.fn(async () => stored), set: jest.fn(async value => { stored = value; }), clear: jest.fn(async () => { stored = null; }) };
  const client = new ApiClient('https://example.invalid');
  const request = jest.spyOn(client, 'request').mockResolvedValue(session);
  const clearCache = jest.fn(), controller = new SessionController(client, credentials, clearCache);
  return { credentials, request, clearCache, controller };
}
describe('secure native session lifecycle', () => {
  it('shares one credential rotation across startup, retry and request recovery', async () => {
    const { controller, request } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    request.mockResolvedValue({ ...session, refreshToken: 'rotated-refresh' });
    const first = controller.restore(), second = controller.restore();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(request.mock.calls.filter(([path]) => path === '/auth/mobile/refresh')).toHaveLength(1);
  });
  it('restores through rotation, persists only the refresh credential and clears caches after revocation', async () => {
    const { controller, credentials, request, clearCache } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    expect(credentials.set).toHaveBeenCalledWith('synthetic-refresh');
    request.mockResolvedValueOnce({ ...session, token: 'rotated-access', refreshToken: 'rotated-refresh' });
    await controller.restore(); expect(controller.current?.token).toBe('rotated-access');
    await controller.logout();
    expect(request).toHaveBeenCalledWith('/auth/mobile/sessions/synthetic-session', { method: 'DELETE' });
    expect(credentials.clear).toHaveBeenCalled(); expect(clearCache).toHaveBeenCalled(); expect(controller.current).toBeNull();
  });
  it('preserves the saved credential when offline recovery fails', async () => {
    const { controller, credentials, request } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    request.mockRejectedValueOnce(new ApiError('Connection unavailable'));
    await expect(controller.restore()).rejects.toThrow('Connection unavailable');
    expect(credentials.clear).not.toHaveBeenCalled();
  });
  it('purges revoked credentials and rejects malformed identities', async () => {
    const { controller, credentials, request } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    request.mockRejectedValueOnce(new ApiError('Revoked', 401));
    await expect(controller.restore()).rejects.toThrow('Revoked');
    expect(credentials.clear).toHaveBeenCalled(); expect(controller.current).toBeNull();
    request.mockResolvedValueOnce({ ...session, agent: { ...session.agent, role: 'builder' } });
    await expect(controller.login('9000000001', 'synthetic', 'Test')).rejects.toThrow('not yet supported');
  });
  it('keeps a session until server-side logout succeeds', async () => {
    const { controller, credentials, request } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    request.mockRejectedValueOnce(new ApiError('Offline'));
    await expect(controller.logout()).rejects.toThrow('Offline');
    expect(controller.current).not.toBeNull(); expect(credentials.clear).not.toHaveBeenCalled();
  });
  it('revokes a newly issued session if secure storage fails', async () => {
    const { controller, credentials, request } = setup();
    jest.mocked(credentials.set).mockRejectedValueOnce(new Error('Storage full'));
    await expect(controller.login('9000000001', 'synthetic', 'Test')).rejects.toThrow('secure session');
    expect(request).toHaveBeenCalledWith('/auth/mobile/sessions/synthetic-session', expect.objectContaining({ method: 'DELETE' }), false);
    expect(controller.current).toBeNull();
  });
  it('does not restore an identity after logout while its private-data purge is pending', async () => {
    const credentials: CredentialStore = { get: async () => 'synthetic-refresh', set: async () => {}, clear: async () => {} };
    let release: (() => void) | undefined;
    const purge = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const api = new ApiClient('https://example.invalid');
    jest.spyOn(api, 'request').mockResolvedValue(session);
    const controller = new SessionController(api, credentials, () => ++calls === 1 ? purge : undefined);
    await controller.login('9000000001', 'synthetic', 'Test');
    jest.spyOn(api, 'request').mockResolvedValue({ ...session, agent: { ...session.agent, role: 'manager' } });
    const refresh = controller.restore();
    while (!calls) await Promise.resolve();
    await controller.clear(); release!();
    await expect(refresh).rejects.toThrow('Session changed'); expect(controller.current).toBeNull();
  });
  it('does not erase a newer login when an older credential save finishes late', async () => {
    const { controller, credentials, request } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    const save = jest.mocked(credentials.set).getMockImplementation()!;
    let release: (() => void) | undefined;
    jest.mocked(credentials.set).mockImplementationOnce(async value => { await new Promise<void>(resolve => { release = resolve; }); await save(value); });
    const oldLogin = controller.login('9000000001', 'synthetic', 'Test');
    while (!release) await Promise.resolve();
    const clear = controller.clear();
    request.mockResolvedValueOnce({ ...session, sessionId: 'new-session', refreshToken: 'new-refresh' });
    const newLogin = controller.login('9000000001', 'synthetic', 'Test');
    const oldResult = expect(oldLogin).rejects.toThrow('Session changed');
    for (let index = 0; index < 10; index++) await Promise.resolve();
    release();
    await Promise.all([clear, newLogin, oldResult]);
    expect(await credentials.get()).toBe('new-refresh');
    expect(controller.current?.sessionId).toBe('new-session');
  });
  it('does not clear a newer login when an old refresh returns 401', async () => {
    const { controller, request, credentials } = setup();
    await controller.login('9000000001', 'synthetic', 'Test');
    let reject: ((error: Error) => void) | undefined;
    request.mockImplementationOnce(async () => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    const oldRefresh = controller.restore();
    while (!reject) await Promise.resolve();
    await controller.clear();
    request.mockResolvedValueOnce({ ...session, sessionId: 'new-session', refreshToken: 'new-refresh' });
    await controller.login('9000000001', 'synthetic', 'Test');
    const oldResult = expect(oldRefresh).rejects.toThrow('Revoked');
    reject(new ApiError('Revoked', 401)); await oldResult;
    expect(controller.current?.sessionId).toBe('new-session');
    expect(await credentials.get()).toBe('new-refresh');
  });
});
