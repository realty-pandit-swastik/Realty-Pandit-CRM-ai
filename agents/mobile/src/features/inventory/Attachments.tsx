import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Notice } from '../../components/Controls';
import { useApi, useSession } from '../auth/SessionProvider';
import { cleanShareFiles, discardAttachment, sharePrivateDocument, sharePropertyPdf, uploadAttachment } from './attachmentFiles';
import { propertyFrom, PropertyDocument } from '../../api/contracts';
import { ApiError } from '../../api/client';
import { styles } from '../../theme/tokens';

export function Attachments({ propertyId, canEdit, documents, refreshAttachments }: { propertyId: string; canEdit: boolean; documents?: PropertyDocument[]; refreshAttachments: () => Promise<void> }) {
  const api = useApi(), { scope, offline, session, controller } = useSession(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<{ uri: string; mime: string; document: boolean } | null>(null);
  const [reconciliation, setReconciliation] = useState<'check' | 'review' | null>(null);
  useEffect(() => { cleanShareFiles(); return () => active.current?.abort(); }, [scope, propertyId]);
  const isCurrent = () => !!session && controller?.current?.sessionId === session.sessionId &&
    controller.current.agent.id === session.agent.id && controller.current.agent.tenant_id === session.agent.tenant_id && controller.current.agent.role === session.agent.role;
  const perform = async (action: (signal: AbortSignal) => Promise<void>, retainError = false) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); if (!retainError) setError(''); setMessage('');
    try { await action(controller.signal); }
    catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'The attachment could not be processed. Try again.';
      if (retainError) setMessage(`Current attachments could not be checked. ${detail}`); else setError(detail);
    }
    finally { active.current = null; setBusy(false); }
  };
  const send = async (selected: { uri: string; mime: string; document: boolean }, signal: AbortSignal) => {
    if (offline || reconciliation) return;
    const current = propertyFrom(await api.request(`/api/inventory/${encodeURIComponent(propertyId)}`, { signal }));
    if (!current.canEdit) throw new Error('You no longer have permission to add attachments to this property.');
    try { await uploadAttachment(api, propertyId, selected.uri, selected.mime, selected.document, signal); }
    catch (failure) { if (failure instanceof ApiError && failure.ambiguous) setReconciliation('check'); throw failure; }
    setPending(null);
    await cache.invalidateQueries({ queryKey: [scope, 'property', propertyId] });
    setMessage(selected.document ? 'Document uploaded.' : 'Photo uploaded.');
  };
  const photo = (camera: boolean) => perform(async signal => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { setMessage('Camera access was denied. You can still choose an existing photo.'); return; }
    const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || signal.aborted) return;
    const selected = result.assets[0];
    const attachment = { uri: selected.uri, mime: selected.mimeType || 'image/jpeg', document: false };
    setPending(attachment); await send(attachment, signal);
  });
  const document = () => perform(async signal => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || signal.aborted) return;
    const selected = result.assets[0];
    const attachment = { uri: selected.uri, mime: selected.mimeType || '', document: true };
    setPending(attachment); await send(attachment, signal);
  });
  return <View style={{ gap: 12 }}><Text style={styles.section}>Attachments and sharing</Text>
    {!!error && <Notice error message={error} />}{!!message && <Notice message={message} />}
    {busy && <Text accessibilityLiveRegion="polite" style={styles.muted}>Preparing attachment…</Text>}
    {canEdit && <><Button title="Take property photo" disabled={offline || busy || !!pending} secondary onPress={() => { void photo(true); }} />
      <Button title="Choose property photo" disabled={offline || busy || !!pending} secondary onPress={() => { void photo(false); }} />
      <Button title="Attach document" disabled={offline || busy || !!pending} secondary onPress={() => { void document(); }} /></>}
    {pending && !busy && <><Notice message={reconciliation ? 'This upload may already be saved. Your selection is kept. Check the current property photos and documents before considering another upload.' : 'Your selected attachment is kept for retry.'} />
      {!!reconciliation && <Button title="Check current attachments" disabled={offline} secondary onPress={() => { void perform(async signal => {
        if (offline) return;
        setReconciliation('check');
        await refreshAttachments();
        if (signal.aborted) return;
        setReconciliation('review');
        setMessage('Current attachments loaded. Review property photos above and documents below. If your attachment is already present, discard your selection.');
      }, true); }} />}
      {reconciliation === 'review' && <Button title="Enable retry after review" disabled={offline} secondary onPress={() => Alert.alert('Have you checked the current attachments?', 'Retry only if you checked the property photos and documents and still need this upload. Another upload can create a duplicate.', [
        { text: 'Keep selection', style: 'cancel' }, { text: 'Allow retry', onPress: () => { setReconciliation(null); setMessage('Review confirmed. You can retry the selected attachment if it is still needed.'); } },
      ])} />}
      <Button title="Retry selected attachment" disabled={offline || !canEdit || !!reconciliation} onPress={() => { void perform(signal => send(pending, signal)); }} />
      <Button title="Discard selection" secondary onPress={() => Alert.alert('Discard selected attachment?', 'You will need to capture or choose it again.', [{ text: 'Keep selection', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { try { discardAttachment(pending.uri); setPending(null); setReconciliation(null); } catch { setError('Could not remove the temporary attachment. Try again.'); } } }])} />
    </>}
    <Button title="Share property PDF" disabled={offline || busy} onPress={() => { void perform(async signal => { await sharePropertyPdf(api, propertyId, signal, isCurrent); setMessage('Share sheet closed. Choose a recipient and send in the selected app. Delivery is not confirmed by Realty Pandit.'); }); }} />
    {busy && <Button title="Cancel transfer" secondary onPress={() => active.current?.abort()} />}
    <Text style={styles.section}>Documents</Text>
    {documents === undefined ? <Text style={styles.muted}>Documents are restricted to the responsible team.</Text> : documents.length === 0 ? <Text style={styles.muted}>No documents attached.</Text> : documents.map(doc => <View key={doc.id} style={{ gap: 8 }}><Text style={styles.body}>{doc.title}</Text>
      {['application/pdf', 'image/jpeg', 'image/png'].includes(doc.mimeType) ? <Button title={`Share ${doc.title}`} secondary disabled={offline || busy} onPress={() => Alert.alert('Share private document?', 'Share only with an authorized recipient. You will choose the app and recipient yourself.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => { void perform(async signal => { await sharePrivateDocument(api, propertyId, doc.id, doc.mimeType, signal, isCurrent); setMessage('Share sheet closed. Delivery is not confirmed by Realty Pandit.'); }); } },
      ])} /> : <Text style={styles.muted}>This file type is not yet supported in the native app.</Text>}
    </View>)}
  </View>;
}
