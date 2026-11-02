import { Platform } from 'react-native';
import { ApiClient } from '../../api/client';
import { cleanPersonalShares, manifestFrom, personalStep, Prepared } from './personalShare';
import { InventoryShare } from '../../../modules/inventory-share';
const mockFiles = new Set<string>(), mockWrite = jest.fn(), mockDelete = jest.fn();
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string; modificationTime = Date.now();
    constructor(parent: string | { uri: string }, name?: string) { this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name || ''}`; }
    get name() { return this.uri.split('/').pop() || ''; }
    get exists() { return mockFiles.has(this.uri); }
    write() { mockFiles.add(this.uri); mockWrite(); }
    delete() { mockFiles.delete(this.uri); mockDelete(); }
  }
  return { File: MockFile, Directory: class { uri = 'file:///cache/rp-handoffs/'; exists = true; create() {} list() { return [...mockFiles].map(p => new MockFile(p)); } }, Paths: { cache: { uri: 'file:///cache/' } } };
});
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digest: jest.fn(async () => new Uint8Array(32).buffer) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../../../modules/inventory-share', () => ({ InventoryShare: { shareAsync: jest.fn(), revoke: jest.fn() } }));
const original = Platform.OS;
beforeEach(() => { Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true }); mockFiles.clear(); mockDelete.mockClear(); mockWrite.mockClear(); jest.mocked(InventoryShare!.shareAsync).mockReset(); });
afterEach(() => { cleanPersonalShares(true); Object.defineProperty(Platform, 'OS', { value: original, configurable: true }); });
function prepared(): Prepared { return { launchToken: 'capability', session: 'opaque-session', manifest: { recipient: '+919000000081', sendingApp: 'com.whatsapp', expiresAt: Date.now() + 60000, steps: [{ propertyId: 'test', label: 'Synthetic', text: 'Public details', kind: 'media', files: ['first', 'second'].map(id => ({ id, name: `${id}.jpg`, mime: 'image/jpeg', size: 4, hash: '0'.repeat(64) })) }] } }; }
it('verifies private files before multi-file handoff and cleans them when the target app is absent', async () => {
  const api = new ApiClient('https://example.invalid'), request = jest.spyOn(api, 'request').mockResolvedValue(new Uint8Array([255, 216, 255, 224]));
  jest.mocked(InventoryShare!.shareAsync).mockRejectedValue(new Error('Native call: The selected WhatsApp app is not installed.'));
  const p = prepared(); await expect(personalStep(api, p, p.manifest.steps[0], new AbortController().signal, () => true)).rejects.toThrow('The selected WhatsApp app is not installed. Your package is kept');
  expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer opaque-session' }); expect(request.mock.calls[0][2]).toBe(false);
  expect(InventoryShare!.shareAsync).toHaveBeenCalledWith(expect.arrayContaining([expect.stringMatching(/rp-handoffs\/\d+-first.jpg$/)]), 'image/jpeg', 'Public details', 'com.whatsapp'); expect(mockFiles.size).toBe(0); expect(mockDelete).toHaveBeenCalledTimes(2);
});
it('never hands files to another account or after expiry', async () => {
  const api = new ApiClient('https://example.invalid'), request = jest.spyOn(api, 'request'); const p = prepared(); p.manifest.expiresAt = 1;
  await expect(personalStep(api, p, p.manifest.steps[0], new AbortController().signal, () => true)).rejects.toThrow('expired'); expect(request).not.toHaveBeenCalled();
  const fresh = prepared(); request.mockResolvedValue(new Uint8Array([255, 216, 255, 224])); let current = true; request.mockImplementation(async () => { current = false; return new Uint8Array([255, 216, 255, 224]); });
  await expect(personalStep(api, fresh, fresh.manifest.steps[0], new AbortController().signal, () => current)).rejects.toThrow('session changed'); expect(InventoryShare!.shareAsync).not.toHaveBeenCalled(); expect(mockWrite).not.toHaveBeenCalled();
});
it('rejects unrecognized prepared attachment MIME', () => { expect(() => manifestFrom({ recipient: 'synthetic', sending_app: 'com.whatsapp', expires_at: 1, steps: [{ property_id: 'test', label: 'test', text: '', kind: 'media', files: [{ id: 'f', name: 'file', mime: 'text/html', size: 4, sha256: 'hash' }] }] })).toThrow('Unsupported'); });
