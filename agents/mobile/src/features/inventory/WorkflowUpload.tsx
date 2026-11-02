import { useState } from 'react';
import { Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { array, object, string } from '../../api/client';
import { useApi } from '../auth/SessionProvider';
import { Button, Notice } from '../../components/Controls';
import { useInventoryMutation } from './useInventoryMutation';
import { display, Value } from './contracts';
import { styles } from '../../theme/tokens';
export function WorkflowUpload({ kind, value, onChange, disabled }: { kind: string; value: Value; onChange: (v: Value) => void; disabled: boolean }) {
  const api = useApi(), m = useInventoryMutation(), [pending, setPending] = useState<{ uri: string; name: string } | null>(null);
  const doc = kind === 'document_upload', video = kind === 'video_upload';
  return <View style={{ gap: 10 }}><Text style={styles.muted}>{display(value)}</Text>{m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="Upload outcome is uncertain. Do not upload the same file again without reviewing the pending submission." />}
    <Button title={doc ? 'Choose workflow document' : video ? 'Choose workflow video' : 'Choose workflow photo'} secondary disabled={disabled || m.disabled} onPress={() => { void m.run(async signal => {
      const choice = doc ? await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: video ? ['videos'] : ['images'], quality: 0.8 });
      if (choice.canceled || signal.aborted) return; const asset = choice.assets[0], file = new File(asset.uri); if (!file.size || file.size > (doc ? 20 : video ? 100 : 10) * 1024 * 1024) throw new Error('The selected file is empty or too large.');
      const name = 'name' in asset && typeof asset.name === 'string' ? asset.name : video ? 'property.mp4' : 'property.jpg'; setPending({ uri: asset.uri, name });
      const body = new FormData(); body.append(doc ? 'document' : video ? 'videos' : 'photos', file, name); if (doc) { body.append('doc_type', 'other'); body.append('title', name); }
      const r = object(await api.request(`/api/workflow/${doc ? 'upload-document' : video ? 'upload-video' : 'upload-media'}`, { method: 'POST', signal, body }));
      const previous = Array.isArray(value) ? value : [];
      onChange(doc ? [...previous, { url: string(r.url), doc_type: 'other', title: name }] : [...previous, ...array(r.urls, string)]); setPending(null);
    }); }} />{pending && <Text style={styles.muted}>Selected: {pending.name}. Your selection is retained if upload fails.</Text>}
  </View>;
}
