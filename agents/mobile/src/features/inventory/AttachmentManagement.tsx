import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Button, Field, Notice } from '../../components/Controls';
import { useApi, useSession } from '../auth/SessionProvider';
import { useInventoryMutation } from './useInventoryMutation';
import { Property, ensureSaved, humanize } from './contracts';
import { styles } from '../../theme/tokens';
import { sharePrivateDocument } from './attachmentFiles';
import { Choice } from '../tasks/Choice';
const docTypes = ['title_deed', 'noc', 'layout_plan', 'sale_agreement', 'encumbrance', 'tax_receipt', 'other'] as const;
export function AttachmentManagement({ property: p, refresh }: { property: Property; refresh: () => Promise<unknown> }) {
  const api = useApi(), m = useInventoryMutation(), { session, controller } = useSession(), [rename, setRename] = useState<Record<string, string>>({}), [docType, setDocType] = useState<string>('other'), [title, setTitle] = useState(''), [notice, setNotice] = useState('');
  const canWriteDocs = p.actions.documents && p.actions.edit;
  async function remove(path: string, signal: AbortSignal) { ensureSaved(await api.request(path, { method: 'DELETE', signal })); await refresh(); }
  return <View style={{ gap: 12 }}><Text style={styles.section}>Manage media and documents</Text>{m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="The change may have completed. Refresh attachments and review before another attempt." />}{notice && <Notice message={notice} />}
    {p.actions.edit && <><Button title="Upload property video" secondary disabled={m.disabled} onPress={() => { void m.run(async signal => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['video/*'], copyToCacheDirectory: true }); if (result.canceled || signal.aborted) return;
      const asset = result.assets[0], file = new File(asset.uri); if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('Choose a video smaller than 100 MB.'); const form = new FormData(); form.append('images', file, asset.name); ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(p.id)}/upload`, { method: 'POST', signal, body: form })); await refresh(); setNotice('Video uploaded.');
    }); }} />{[...p.images, ...p.videos].map((url, index) => <Button key={url} title={`Remove ${p.images.includes(url) ? 'photo' : 'video'} ${index + 1}`} secondary disabled={m.disabled} onPress={() => Alert.alert('Remove property media?', 'This file will be removed from the listing.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void m.run(signal => remove(`/api/inventory/${encodeURIComponent(p.id)}/media/${encodeURIComponent(url.split('/').pop()!.split('?')[0])}`, signal)); } }])} />)}</>}
    {canWriteDocs && <><Choice title="Document type" value={docType} options={docTypes} onChange={setDocType} /><Field label="Document title" value={title} onChangeText={setTitle} /><Button title="Upload document with title and type" secondary disabled={m.disabled || !title.trim()} onPress={() => { void m.run(async signal => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true }); if (result.canceled || signal.aborted) return;
      const asset = result.assets[0], file = new File(asset.uri); if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a document smaller than 20 MB.'); const form = new FormData(); form.append('document', file, asset.name); form.append('doc_type', docType); form.append('title', title.trim()); ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(p.id)}/documents`, { method: 'POST', body: form, signal })); await refresh(); setNotice('Document uploaded.');
    }); }} /></>}
    {p.documents?.map(doc => <View key={doc.id} style={styles.row}><Text style={styles.section}>Document: {doc.title}</Text><Text style={styles.muted}>{[doc.type && humanize(doc.type), doc.fileName, doc.mimeType, doc.size === undefined ? undefined : `${doc.size} bytes`, doc.createdAt].filter(Boolean).join(' · ')}</Text>
      <Button title={`Download or open ${doc.title}`} secondary disabled={m.disabled} onPress={() => { void m.run(async signal => { await sharePrivateDocument(api, p.id, doc.id, doc.mimeType, signal, () => controller?.current?.sessionId === session?.sessionId); setNotice('File handed to the chosen app. Sending is not confirmed.'); }); }} />
      {canWriteDocs && <><Field label={`New title for ${doc.title}`} value={rename[doc.id] ?? doc.title} onChangeText={value => setRename(r => ({ ...r, [doc.id]: value }))} /><Button title={`Rename ${doc.title}`} secondary disabled={m.disabled} onPress={() => { void m.run(async signal => { ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(p.id)}/documents/${encodeURIComponent(doc.id)}`, { method: 'PATCH', body: JSON.stringify({ title: rename[doc.id] ?? doc.title }), signal })); await refresh(); }); }} /><Button title={`Delete ${doc.title}`} secondary disabled={m.disabled} onPress={() => Alert.alert('Delete private document?', `Delete ${doc.title} permanently?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void m.run(signal => remove(`/api/inventory/${encodeURIComponent(p.id)}/documents/${encodeURIComponent(doc.id)}`, signal)); } }])} /></>}
    </View>)}
  </View>;
}
