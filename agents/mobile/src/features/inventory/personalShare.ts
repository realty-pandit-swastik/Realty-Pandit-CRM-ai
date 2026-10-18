import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { ApiClient, array, number, object, string, ApiError } from '../../api/client';
import { InventoryShare } from '../../../modules/inventory-share';
const root = () => new Directory(Paths.cache, 'rp-handoffs');
let generation = 0;
export function cleanPersonalShares(all = false) {
  if (all) { generation++; InventoryShare?.revoke(); }
  const directory = root(); if (!directory.exists) return;
  for (const file of directory.list()) if (file instanceof File && (all || (/^\d{13}-/.test(file.name) && Number(file.name.slice(0, 13)) <= Date.now()) || !file.modificationTime || Date.now() - file.modificationTime > 10 * 60_000)) file.delete();
}
export type PersonalStep = { propertyId: string; label: string; text: string; kind: string; files: { id: string; name: string; mime: string; size: number; hash: string }[] };
export function manifestFrom(value: unknown) { const v = object(value); return { recipient: string(v.recipient), sendingApp: string(v.sending_app), expiresAt: number(v.expires_at), steps: array(v.steps, e => { const r = object(e); return { propertyId: string(r.property_id), label: string(r.label), text: string(r.text), kind: string(r.kind), files: array(r.files, f => { const file = object(f); const mime = string(file.mime); if (!['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'].includes(mime)) throw new Error('Unsupported prepared attachment type.'); return { id: string(file.id), name: string(file.name), mime, size: number(file.size), hash: string(file.sha256) }; }) }; }) }; }
export type Prepared = { launchToken: string; session: string; manifest: ReturnType<typeof manifestFrom> };
export async function preparePersonal(api: ApiClient, body: unknown, signal: AbortSignal): Promise<Prepared> {
  cleanPersonalShares(); const result = object(await api.request('/api/personal-whatsapp/handoffs', { method: 'POST', body: JSON.stringify(body), signal }));
  const launchToken = string(result.launch_token);
  try { const claimed = object(await api.request('/api/personal-whatsapp/handoffs/claim', { method: 'POST', headers: { Authorization: `Bearer ${launchToken}` }, signal }, false)); return { launchToken, session: string(claimed.session), manifest: manifestFrom(claimed.manifest) }; }
  catch (error) { await api.request('/api/personal-whatsapp/handoffs/cancel', { method: 'POST', body: JSON.stringify({ launch_token: launchToken }) }).catch(() => {}); throw error; }
}
export async function personalStep(api: ApiClient, prepared: Prepared, step: PersonalStep, signal: AbortSignal, current: () => boolean) {
  const start = generation, check = () => { if (signal.aborted || start !== generation || !current()) throw new ApiError('Share cancelled or session changed.'); if (Date.now() >= prepared.manifest.expiresAt) throw new ApiError('Prepared share expired. Prepare it again.'); };
  check(); root().create({ idempotent: true, intermediates: true });
  const files: File[] = []; let total = 0;
  try {
    for (const attachment of step.files) {
      check(); total += attachment.size; if (total > 40 * 1024 * 1024) throw new Error('The prepared share exceeds 40 MiB.');
      const bytes = await api.request(`/api/personal-whatsapp/handoffs/files/${encodeURIComponent(attachment.id)}`, { headers: { Authorization: `Bearer ${prepared.session}` }, signal, download: { mimeType: attachment.mime, maxBytes: Math.min(attachment.size, 40 * 1024 * 1024) } }, false);
      if (!(bytes instanceof Uint8Array) || bytes.length !== attachment.size) throw new Error('Attachment size could not be verified.');
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes).buffer), hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (hex !== attachment.hash) throw new Error('Attachment verification failed.'); check();
      const extension = attachment.mime === 'application/pdf' ? 'pdf' : attachment.mime === 'video/mp4' ? 'mp4' : attachment.mime === 'image/png' ? 'png' : 'jpg';
      const file = new File(root(), `${prepared.manifest.expiresAt}-${attachment.id}.${extension}`); files.push(file); file.write(bytes);
    }
    check();
    if (Platform.OS === 'android') { if (!InventoryShare) throw new Error('Install the latest development build to share multiple files.'); const types = new Set(step.files.map(f => f.mime)); try { await InventoryShare.shareAsync(files.map(f => f.uri), types.size === 1 ? step.files[0].mime : '*/*', step.text, prepared.manifest.sendingApp); } catch (error) { const missing = error instanceof Error && error.message.includes('not installed'); throw new ApiError(missing ? 'The selected WhatsApp app is not installed. Your package is kept; choose an installed app or install it before continuing.' : 'Could not confirm the WhatsApp handoff. Review WhatsApp before opening this package again.'); } }
    else { if (files.length !== 1) throw new Error('Multi-file WhatsApp handoff requires Android. Choose one attachment for this platform.'); if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable.'); check(); await Sharing.shareAsync(files[0].uri, { mimeType: step.files[0].mime }); }
    check();
    setTimeout(() => { for (const file of files) if (file.exists) file.delete(); }, Math.max(1, prepared.manifest.expiresAt - Date.now()));
  } catch (error) { for (const file of files) if (file.exists) file.delete(); throw error; }
}
