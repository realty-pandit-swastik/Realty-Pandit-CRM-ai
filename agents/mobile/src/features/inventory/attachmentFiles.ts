import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ensureSaved } from './contracts';
import { ApiClient, ApiError } from '../../api/client';

const MIME_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'image/webp': 'webp', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
const shareDirectory = () => new Directory(Paths.cache, 'rp-shares');
let shareGeneration = 0;

export function validateAttachment(size: number, mime: string, document: boolean) {
  if (!Number.isFinite(size) || size <= 0 || size > (document ? 20 : 8) * 1024 * 1024) throw new ApiError(document ? 'Choose a document smaller than 20 MB.' : 'Choose a photo smaller than 8 MB.');
  if (!MIME_EXTENSIONS[mime] || (!document && !mime.startsWith('image/'))) throw new ApiError('Choose a JPEG or PNG photo, or a PDF document.');
}

export async function uploadAttachment(api: ApiClient, propertyId: string, uri: string, mime: string, document: boolean, signal: AbortSignal) {
  const file = new File(uri);
  validateAttachment(file.size, mime, document);
  const body = new FormData();
  body.append(document ? 'document' : 'images', file, `property-attachment.${MIME_EXTENSIONS[mime]}`);
  if (document) { body.append('doc_type', 'other'); body.append('title', 'Property document'); }
  const result = ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(propertyId)}/${document ? 'documents' : 'upload'}`, { method: 'POST', body, signal }));
  // Keep the selected file when upload fails so a captured photo is not lost.
  try { discardAttachment(uri); } catch { /* shortcut: successful uploads survive cleanup failure; add cache reconciliation before release. */ }
  return result;
}

export function discardAttachment(uri: string) {
  const file = new File(uri);
  if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
}

export function cleanShareFiles(all = false) {
  if (all) shareGeneration++;
  const directory = shareDirectory();
  if (!directory.exists) return;
  for (const file of directory.list()) {
    if (file instanceof File && (all || !file.modificationTime || Date.now() - file.modificationTime > 10 * 60_000)) file.delete();
  }
}

function shareGuard(signal: AbortSignal, isCurrent: () => boolean) {
  const generation = shareGeneration;
  return () => {
    if (signal.aborted) throw new ApiError('Sharing cancelled.');
    if (generation !== shareGeneration || !isCurrent()) throw new ApiError('Session changed. Open the property again before sharing.', 401);
  };
}

export async function shareInventoryPdf(api: ApiClient, propertyIds: string[], signal: AbortSignal, isCurrent: () => boolean) {
  const check = shareGuard(signal, isCurrent); check();
  if (!await Sharing.isAvailableAsync()) throw new ApiError('File sharing is unavailable on this device.');
  check();
  cleanShareFiles();
  const bytes = await api.request('/api/inventory/share-pdf', { method: 'POST', body: JSON.stringify({ inventory_ids: propertyIds, variant: 'brandless' }),
    signal, download: { maxBytes: 20 * 1024 * 1024, mimeType: 'application/pdf' } });
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new ApiError('The generated PDF could not be verified.');
  await shareBytes(bytes, 'application/pdf', signal, check);
}

export async function sharePropertyPdf(api: ApiClient, propertyId: string, signal: AbortSignal, isCurrent: () => boolean) { return shareInventoryPdf(api, [propertyId], signal, isCurrent); }
async function shareBytes(bytes: Uint8Array, mimeType: string, signal: AbortSignal, check: () => void) {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new ApiError('This document type is not yet supported on mobile.');
  check();
  const directory = shareDirectory(); directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, `attachment-${Date.now()}.${extension}`);
  const discard = () => { if (file.exists) file.delete(); };
  signal.addEventListener('abort', discard, { once: true });
  try {
    await file.write(bytes);
    check();
    // shortcut: OS targets may read after the sheet resolves; clean after ten minutes on feature entry, add background cleanup before release.
    await Sharing.shareAsync(file.uri, { mimeType, ...(mimeType === 'application/pdf' ? { UTI: 'com.adobe.pdf' } : {}), dialogTitle: 'Share attachment' });
    check();
  } catch (error) { discard(); throw error; }
  finally { signal.removeEventListener('abort', discard); }
}

export async function sharePrivateDocument(api: ApiClient, propertyId: string, documentId: string, mimeType: string, signal: AbortSignal, isCurrent: () => boolean) {
  const check = shareGuard(signal, isCurrent); check();
  if (!MIME_EXTENSIONS[mimeType]) throw new ApiError('This document type is not yet supported on mobile.');
  if (!await Sharing.isAvailableAsync()) throw new ApiError('File sharing is unavailable on this device.');
  check();
  cleanShareFiles();
  const bytes = await api.request(`/api/inventory/${encodeURIComponent(propertyId)}/documents/${encodeURIComponent(documentId)}/download`, {
    signal, download: { maxBytes: 20 * 1024 * 1024, mimeType },
  });
  if (!(bytes instanceof Uint8Array)) throw new ApiError('The downloaded file could not be verified.');
  await shareBytes(bytes, mimeType, signal, check);
}
