import { Directory, File, Paths } from 'expo-file-system';
import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync, CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ApiError, number, object, string } from '../api/client';

const directory = () => new Directory(Paths.document, 'rp-drafts-v1');
const keyName = 'rp.mobile.drafts.key.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const lifetime = 24 * 60 * 60_000, maxBytes = 64 * 1024, maxFiles = 80;
const encoder = new TextEncoder(), decoder = new TextDecoder();
let keyPromise: Promise<AESEncryptionKey> | null = null, generation = 0, queue = Promise.resolve();

function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.then(() => {}, () => {});
  return result;
}
function key() {
  if (!keyPromise) keyPromise = (async () => {
    const root = directory();
    // iOS keychain entries can survive reinstall; a missing install directory rotates the old key.
    if (!root.exists) { await SecureStore.deleteItemAsync(keyName, options); root.create({ intermediates: true, idempotent: true }); }
    const stored = await SecureStore.getItemAsync(keyName, options);
    if (stored) return AESEncryptionKey.import(stored, 'base64');
    const created = await AESEncryptionKey.generate(AESKeySize.AES256);
    await SecureStore.setItemAsync(keyName, await created.encoded('base64'), options);
    return created;
  })().catch(error => { keyPromise = null; throw error; });
  return keyPromise;
}
async function prefix(scope: string, kind: string) { return `${await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([scope, kind]))}-`; }
function files(prefix = '') {
  const root = directory();
  return root.exists ? root.list().filter((entry): entry is File => entry instanceof File && entry.name.startsWith(prefix)).sort((a, b) => b.name.localeCompare(a.name)) : [];
}
function expireFiles() {
  for (const file of files()) if (!file.modificationTime || Date.now() - file.modificationTime > lifetime) file.delete();
}

export type SavedDraft<T> = { value: T; savedAt: number; recovered: boolean };

export function readDraft<T>(scope: string, kind: string, parse: (value: unknown) => T): Promise<SavedDraft<T> | null> {
  const started = generation;
  return serial(async () => {
    expireFiles();
    const candidates = files(await prefix(scope, kind));
    if (!candidates.length) return null;
    const encryptionKey = await key();
    for (let index = 0; index < Math.min(candidates.length, 4); index++) {
      const file = candidates[index];
      try {
        if (file.size > maxBytes * 2) throw new Error('Oversized draft');
        const sealed = AESSealedData.fromCombined(await file.text());
        const plaintext = await aesDecryptAsync(sealed, encryptionKey, { additionalData: encoder.encode(JSON.stringify([scope, kind])) });
        if (plaintext.length > maxBytes) throw new Error('Oversized draft');
        const envelope = object(JSON.parse(decoder.decode(plaintext))), savedAt = number(envelope.savedAt);
        if (string(envelope.scope) !== scope || string(envelope.kind) !== kind || savedAt > Date.now() + 60_000 || Date.now() - savedAt > lifetime) throw new Error('Expired draft');
        const value = parse(envelope.value);
        return started === generation ? { value, savedAt, recovered: index > 0 } : null;
      } catch { file.delete(); }
    }
    throw new ApiError('The saved draft could not be recovered. Its damaged files were removed; your server record is unchanged.');
  });
}

export function writeDraft(scope: string, kind: string, value: Record<string, string>, isCurrent: () => boolean): Promise<void> {
  const started = generation;
  return serial(async () => {
    if (!isCurrent() || started !== generation) return;
    const bytes = encoder.encode(JSON.stringify({ scope, kind, savedAt: Date.now(), value }));
    if (bytes.length > maxBytes) throw new ApiError('This draft is too large to save on this device. Keep the app open and save online.');
    const encryptionKey = await key();
    expireFiles();
    if (files().length >= maxFiles) throw new ApiError('Device draft storage is full. Save or discard older drafts before adding another.');
    const name = await prefix(scope, kind);
    const encrypted = await aesEncryptAsync(bytes, encryptionKey, { additionalData: encoder.encode(JSON.stringify([scope, kind])) });
    if (!isCurrent() || started !== generation) return;
    // Append revisions so termination during a write leaves the previous authenticated draft intact.
    const previousRevision = Number(files(name)[0]?.name.slice(name.length, name.length + 16)) || 0;
    const revision = Math.max(Date.now(), previousRevision + 1);
    const file = new File(directory(), `${name}${revision.toString().padStart(16, '0')}-${randomUUID()}.enc`);
    try { await file.write(await encrypted.combined('base64')); }
    catch (error) { if (file.exists) file.delete(); throw error; }
    if (!isCurrent() || started !== generation) { file.delete(); return; }
    for (const previous of files(name).slice(2)) previous.delete();
  });
}

export function removeDraft(scope: string, kind: string) {
  return serial(async () => { for (const file of files(await prefix(scope, kind))) file.delete(); });
}

export function clearDrafts() {
  generation++;
  return serial(async () => {
    try { await SecureStore.deleteItemAsync(keyName, options); }
    finally { keyPromise = null; const root = directory(); if (root.exists) root.delete(); }
  });
}
