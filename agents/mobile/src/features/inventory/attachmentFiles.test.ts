import { cleanShareFiles, sharePrivateDocument, sharePropertyPdf, uploadAttachment, validateAttachment } from './attachmentFiles';
import { ApiClient } from '../../api/client';
import * as Sharing from 'expo-sharing';
const mockDelete = jest.fn();
const mockWrite = jest.fn();
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => {
  class MockFile extends Blob {
    uri: string;
    constructor(parent: string | { uri: string }, name?: string) { super([new Uint8Array(64)]); this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name || ''}`; }
    get exists() { return !this.uri.includes('rp-shares') || mockFiles.has(this.uri); }
    delete() { mockFiles.delete(this.uri); mockDelete(); }
    write(bytes: Uint8Array) {
      const writing = mockWrite(bytes);
      if (writing instanceof Promise) return writing.then(() => { mockFiles.add(this.uri); });
      mockFiles.add(this.uri);
    }
  }
  return { Directory: class {
    uri = 'file:///cache/rp-shares/'; exists = true;
    create() {}
    list() { return [...mockFiles].map(uri => new MockFile(uri)); }
  }, File: MockFile, Paths: { cache: { uri: 'file:///cache/' } } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
beforeEach(() => {
  mockDelete.mockClear(); mockWrite.mockReset(); mockFiles.clear();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockReset().mockResolvedValue(undefined);
});

it('bounds attachment size and MIME before upload', () => {
  expect(() => validateAttachment(1024, 'image/jpeg', false)).not.toThrow();
  expect(() => validateAttachment(1024, 'application/pdf', true)).not.toThrow();
  for (const size of [0, -1, NaN, 9 * 1024 * 1024]) expect(() => validateAttachment(size, 'image/jpeg', false)).toThrow();
  expect(() => validateAttachment(21 * 1024 * 1024, 'application/pdf', true)).toThrow();
  expect(() => validateAttachment(1024, 'application/pdf', false)).toThrow();
  expect(() => validateAttachment(1024, 'text/html', true)).toThrow();
});

it('keeps the selected file when a server upload fails', async () => {
  const api = new ApiClient('https://example.invalid');
  jest.spyOn(api, 'request').mockRejectedValue(new Error('Upload failed'));
  await expect(uploadAttachment(api, 'synthetic', 'file:///cache/synthetic.pdf', 'application/pdf', true, new AbortController().signal)).rejects.toThrow('Upload failed');
  expect(mockDelete).not.toHaveBeenCalled();
});

it('sends the required backend document metadata with a picked file', async () => {
  const api = new ApiClient('https://example.invalid');
  jest.spyOn(api, 'request').mockImplementation(async (_path, options) => {
    if (!(options?.body instanceof FormData)) throw new Error('Expected multipart body');
    expect(options.body.getAll('doc_type')).toEqual(['other']);
    expect(options.body.getAll('title')).toEqual(['Property document']);
    expect(options.body.getAll('document')).toHaveLength(1);
    return { id: 'synthetic-document' };
  });
  await uploadAttachment(api, 'synthetic', 'file:///cache/synthetic.pdf', 'application/pdf', true, new AbortController().signal);
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
const shareCases = ['property PDF', 'private document'] as const;
it.each(shareCases)('hands a verified %s to the native share sheet', async kind => {
  const api = new ApiClient('https://example.invalid');
  jest.spyOn(api, 'request').mockResolvedValue(pdf);
  const signal = new AbortController().signal;
  await (kind === 'property PDF' ? sharePropertyPdf(api, 'synthetic', signal, () => true) : sharePrivateDocument(api, 'synthetic', 'document', 'application/pdf', signal, () => true));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\/rp-shares\/.*\.pdf$/), expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  expect(mockFiles.size).toBe(1);
  cleanShareFiles(true);
  expect(mockFiles.size).toBe(0);
});

it.each(shareCases.flatMap(kind => ['download', 'file write'].flatMap(stage => ['cancel', 'identity reset', 'purge'].map(interruption => [kind, stage, interruption] as const))))(
  'does not hand off or retain a %s after %s is interrupted by %s', async (kind, stage, interruption) => {
    const api = new ApiClient('https://example.invalid');
    const controller = new AbortController();
    let current = true;
    const download = deferred<unknown>(), write = deferred<void>(), entered = deferred<void>();
    jest.spyOn(api, 'request').mockImplementation(async () => {
      if (stage === 'download') { entered.resolve(); return download.promise; }
      return pdf;
    });
    if (stage === 'file write') mockWrite.mockImplementationOnce(() => { entered.resolve(); return write.promise; });
    const sharing = kind === 'property PDF' ? sharePropertyPdf(api, 'synthetic', controller.signal, () => current) :
      sharePrivateDocument(api, 'synthetic', 'document', 'application/pdf', controller.signal, () => current);
    const rejected = expect(sharing).rejects.toThrow(interruption === 'cancel' ? 'Sharing cancelled.' : 'Session changed.');
    await entered.promise;
    if (interruption === 'cancel') controller.abort();
    else if (interruption === 'identity reset') { current = false; api.reset(); }
    else cleanShareFiles(true);
    download.resolve(pdf); write.resolve();
    await rejected;
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
    if (stage === 'download') expect(mockWrite).not.toHaveBeenCalled();
  },
);
