import { ApiClient, ApiError, apiOrigin } from './client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('native API transport', () => {
  it('requires HTTPS except explicit local development and rejects credentials in origins', () => {
    expect(apiOrigin('https://api.example.invalid', false)).toBe('https://api.example.invalid');
    expect(apiOrigin('http://10.0.2.2:3000', true)).toBe('http://10.0.2.2:3000');
    expect(() => apiOrigin('http://10.0.2.2:3000', false)).toThrow();
    expect(() => apiOrigin('https://user:password@example.invalid', true)).toThrow();
    expect(() => apiOrigin('https://example.invalid/path', true)).toThrow();
  });
  it('attaches bearer credentials, omits browser cookies, and refreshes concurrent 401s once', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async (_url, options) =>
      new Headers(options?.headers).get('Authorization') === 'Bearer fresh' ? json({ ok: true }) : json({ error: 'Expired' }, 401));
    const client = new ApiClient('https://api.example.invalid', fetcher);
    client.setAccessToken('old');
    client.refresh = jest.fn(async () => { await Promise.resolve(); client.setAccessToken('fresh'); });
    expect(await Promise.all([client.request('/one'), client.request('/two')])).toEqual([{ ok: true }, { ok: true }]);
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, options]) => options?.credentials === 'omit')).toBe(true);
  });
  it('never retries failed writes or provider responses', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(json({ error: 'Internal private failure' }, 503));
    const client = new ApiClient('https://api.example.invalid', fetcher);
    await expect(client.request('/write', { method: 'POST', body: '{}' })).rejects.toThrow('The server could not finish');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized or incorrectly typed downloads before accepting their body', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValueOnce(new Response('too large', { headers: { 'content-type': 'application/pdf', 'content-length': '100' } }))
      .mockResolvedValueOnce(json({ wrong: true }));
    const client = new ApiClient('https://api.example.invalid', fetcher);
    const options = { download: { maxBytes: 10, mimeType: 'application/pdf' } };
    await expect(client.request('/download', options)).rejects.toThrow('too large');
    await expect(client.request('/download', options)).rejects.toThrow('unexpected file type');
  });
  it('bounds the timeout, marks ambiguous writes, and does not expose request URLs', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('private network URL')));
    }));
    const client = new ApiClient('https://api.example.invalid', fetcher, 5);
    await expect(client.request('/write', { method: 'POST' })).rejects.toMatchObject({ ambiguous: true, status: 0 });
  });
  it('rejects responses arriving after identity changes', async () => {
    let finish: (response: Response) => void = () => {};
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const client = new ApiClient('https://api.example.invalid', fetcher);
    const pending = client.request('/private'); client.reset(); finish(json({ private: true }));
    await expect(pending).rejects.toBeInstanceOf(ApiError);
  });
  it('retries authentication at most once and clears an expired identity', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async () => json({ error: 'Expired' }, 401));
    const client = new ApiClient('https://api.example.invalid', fetcher);
    client.refresh = jest.fn(async () => {}); client.expired = jest.fn(async () => {});
    await expect(client.request('/private')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(client.expired).toHaveBeenCalledTimes(1);
  });
  it('ignores a stale refresh failure after a newer identity is installed', async () => {
    let reject: ((error: Error) => void) | undefined;
    const client = new ApiClient('https://api.example.invalid', async () => json({ error: 'Expired' }, 401));
    client.refresh = () => new Promise((_resolve, rejectRefresh) => { reject = rejectRefresh; });
    client.expired = jest.fn(async () => {});
    const pending = client.request('/private');
    while (!reject) await Promise.resolve();
    client.reset(); client.setAccessToken('new-account-access');
    const result = expect(pending).rejects.toMatchObject({ status: 401 });
    reject(new ApiError('Old refresh revoked', 401)); await result;
    expect(client.expired).not.toHaveBeenCalled();
  });
  it('keeps a new identity refresh single-flight when an old refresh finishes', async () => {
    let rejectOld: ((error: Error) => void) | undefined, finishNew: (() => void) | undefined;
    const client = new ApiClient('https://api.example.invalid', async (_url, options) =>
      new Headers(options?.headers).get('Authorization') === 'Bearer fresh' ? json({ ok: true }) : json({}, 401));
    client.refresh = jest.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockImplementation(() => new Promise<void>(resolve => { finishNew = () => { client.setAccessToken('fresh'); resolve(); }; }));
    const old = client.request('/old');
    while (!rejectOld) await Promise.resolve();
    client.reset(); const newer = client.request('/new');
    while (!finishNew) await Promise.resolve();
    const oldResult = expect(old).rejects.toMatchObject({ status: 401 });
    rejectOld(new ApiError('Old refresh revoked', 401)); await oldResult;
    const concurrent = client.request('/concurrent');
    for (let index = 0; index < 5; index++) await Promise.resolve();
    expect(client.refresh).toHaveBeenCalledTimes(2);
    finishNew(); expect(await Promise.all([newer, concurrent])).toEqual([{ ok: true }, { ok: true }]);
  });
});
