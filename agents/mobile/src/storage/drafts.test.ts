import { clearDrafts, readDraft, removeDraft, writeDraft } from './drafts';
import { leadNotesDraft } from './draftContracts';
import { createHash } from 'node:crypto';

const mockFiles = new Map<string, { value: string; modified: number }>();
const mockKeys = new Map<string, string>();
let mockDirectory = false, mockWriteFailure = false;
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(parent: { uri: string } | string, name?: string) { this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? `/${name}` : ''}`; }
    get exists() { return mockFiles.has(this.uri); }
    get name() { return this.uri.split('/').pop()!; }
    get size() { return Buffer.byteLength(mockFiles.get(this.uri)?.value || ''); }
    get modificationTime() { return mockFiles.get(this.uri)?.modified; }
    async text() { return mockFiles.get(this.uri)!.value; }
    async write(value: string) { mockFiles.set(this.uri, { value, modified: Date.now() }); if (mockWriteFailure) { mockWriteFailure = false; throw new Error('Synthetic disk failure'); } }
    delete() { mockFiles.delete(this.uri); }
  }
  return { File, Paths: { document: { uri: 'file:///documents' } }, Directory: class {
    uri = 'file:///documents/rp-drafts-v1';
    get exists() { return mockDirectory; }
    create() { mockDirectory = true; }
    list() { return [...mockFiles.keys()].map(uri => new File(uri)); }
    delete() { mockFiles.clear(); mockDirectory = false; }
  } };
});
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: async (key: string) => mockKeys.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockKeys.set(key, value); },
  deleteItemAsync: async (key: string) => { mockKeys.delete(key); },
}));
jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  class Key {
    data: Buffer;
    constructor(mockBytes: Buffer) { this.data = mockBytes; }
    static async generate() { return new Key(crypto.randomBytes(32)); }
    static async import(value: string) { return new Key(Buffer.from(value, 'base64')); }
    async encoded() { return this.data.toString('base64'); }
  }
  return { AESEncryptionKey: Key, AESKeySize: { AES256: 256 }, CryptoDigestAlgorithm: { SHA256: 'sha256' }, randomUUID: crypto.randomUUID,
    digestStringAsync: async (_algorithm: unknown, value: string) => crypto.createHash('sha256').update(value).digest('hex'),
    AESSealedData: { fromCombined: (value: string) => Buffer.from(value, 'base64') },
    aesEncryptAsync: async (value: Uint8Array, key: Key, options: { additionalData: Uint8Array }) => {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key.data, iv);
      cipher.setAAD(options.additionalData);
      const bytes = Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]);
      return { combined: async () => bytes.toString('base64') };
    },
    aesDecryptAsync: async (bytes: Buffer, key: Key, options: { additionalData: Uint8Array }) => {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key.data, bytes.subarray(0, 12));
      cipher.setAAD(options.additionalData); cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]);
    },
  };
});

const scope = 'https://example.invalid:tenant:member:employee:device';
const fields = { notes: 'Synthetic local notes', baseNotes: 'Original saved notes' };
afterEach(async () => { await clearDrafts(); jest.restoreAllMocks(); });

it('encrypts device drafts, hides identifying filenames and restores only the bound partition', async () => {
  await writeDraft(scope, 'lead:synthetic', fields, () => true);
  const restored = await readDraft(scope, 'lead:synthetic', leadNotesDraft);
  expect(restored?.value).toEqual(fields);
  for (const [name, file] of mockFiles) { expect(name).not.toContain('member'); expect(file.value).not.toContain(fields.notes); }
  expect(mockKeys.size).toBe(1);
  for (const part of ['example.invalid', 'tenant', 'member', 'employee', 'device']) {
    expect(await readDraft(scope.replace(part, `foreign-${part}`), 'lead:synthetic', leadNotesDraft)).toBeNull();
  }
});
it('rejects a ciphertext transplanted into another account namespace', async () => {
  await writeDraft(scope, 'lead:synthetic', fields, () => true);
  const foreign = 'foreign-account', hash = createHash('sha256').update(JSON.stringify([foreign, 'lead:synthetic'])).digest('hex');
  mockFiles.set(`file:///documents/rp-drafts-v1/${hash}-0000000000000001.enc`, [...mockFiles.values()][0]);
  await expect(readDraft(foreign, 'lead:synthetic', leadNotesDraft)).rejects.toThrow('could not be recovered');
  expect((await readDraft(scope, 'lead:synthetic', leadNotesDraft))?.value).toEqual(fields);
});
it('keeps a prior authenticated revision after corruption or an interrupted write', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  await writeDraft(scope, 'lead:synthetic', fields, () => true);
  await writeDraft(scope, 'lead:synthetic', { ...fields, notes: 'Newer local notes' }, () => true);
  const latest = [...mockFiles.keys()].sort().pop()!; mockFiles.get(latest)!.value = 'damaged';
  const restored = await readDraft(scope, 'lead:synthetic', leadNotesDraft);
  expect(restored?.value).toEqual(fields); expect(restored?.recovered).toBe(true);
  mockWriteFailure = true;
  await expect(writeDraft(scope, 'lead:synthetic', { ...fields, notes: 'Interrupted notes' }, () => true)).rejects.toThrow('disk failure');
  expect((await readDraft(scope, 'lead:synthetic', leadNotesDraft))?.value).toEqual(fields);
});
it('expires drafts after 24 hours and purges keys/files on logout', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  await writeDraft(scope, 'lead:synthetic', fields, () => true);
  clock.mockReturnValue(1_000_000 + 24 * 60 * 60_000 + 1);
  expect(await readDraft(scope, 'lead:synthetic', leadNotesDraft)).toBeNull(); expect(mockFiles.size).toBe(0);
  await clearDrafts(); expect(mockKeys.size).toBe(0); expect(mockDirectory).toBe(false);
});
it('bounds size and revision count without losing the last saved draft', async () => {
  await writeDraft(scope, 'lead:synthetic', fields, () => true);
  await expect(writeDraft(scope, 'lead:synthetic', { ...fields, notes: 'x'.repeat(64 * 1024) }, () => true)).rejects.toThrow('too large');
  for (let index = 0; index < 8; index++) await writeDraft(scope, 'lead:synthetic', { ...fields, notes: String(index) }, () => true);
  expect(mockFiles.size).toBe(2); expect((await readDraft(scope, 'lead:synthetic', leadNotesDraft))?.value.notes).toBe('7');
});
it('does not recreate private data from writes queued before logout or after identity changes', async () => {
  const write = writeDraft(scope, 'lead:synthetic', fields, () => true), logout = clearDrafts();
  await Promise.all([write, logout]); expect(mockFiles.size).toBe(0); expect(mockKeys.size).toBe(0);
  await writeDraft(scope, 'lead:synthetic', fields, () => false); expect(mockFiles.size).toBe(0); expect(mockKeys.size).toBe(0);
});
it('bounds the device file count and frees capacity only through explicit discard', async () => {
  for (let index = 0; index < 80; index++) await writeDraft(scope, `lead:${index}`, fields, () => true);
  await expect(writeDraft(scope, 'lead:overflow', fields, () => true)).rejects.toThrow('storage is full');
  expect(mockFiles.size).toBe(80);
  expect((await readDraft(scope, 'lead:0', leadNotesDraft))?.value).toEqual(fields);
  await removeDraft(scope, 'lead:0');
  await writeDraft(scope, 'lead:replacement', fields, () => true);
  expect(mockFiles.size).toBe(80);
});
