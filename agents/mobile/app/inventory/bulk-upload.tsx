import { useState } from 'react';
import { Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, FormScreen, Notice } from '../../src/components/Controls';
import { useInventoryMutation } from '../../src/features/inventory/useInventoryMutation';
import { display, valueFrom } from '../../src/features/inventory/contracts';
import { styles } from '../../src/theme/tokens';
export default function BulkUpload() {
  const api = useApi(), { session } = useSession(), m = useInventoryMutation(), [selected, setSelected] = useState<{ uri: string; name: string } | null>(null), [result, setResult] = useState('');
  if (!session?.agent.permissions.includes('bulk_upload')) return <Notice error message="You do not have permission to bulk upload inventory." />;
  return <FormScreen><Text style={styles.heading}>Bulk upload inventory</Text><Text style={styles.body}>Use the current CRM CSV template. The server validates each row and reports imported and skipped rows.</Text>
    {m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="Some rows may already be imported. Review inventory before uploading again." />}{!!result && <Notice message={result} />}
    <Button title="Download CSV template" secondary disabled={m.disabled} onPress={() => { void m.run(async signal => {
      const bytes = await api.request('/api/team/inventory/bulk-template', { signal, download: { mimeType: 'text/csv', maxBytes: 1024 * 1024 } }); if (!(bytes instanceof Uint8Array)) throw new Error('Template could not be downloaded.');
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable.'); if (signal.aborted) return;
      const dir = new Directory(Paths.cache, 'rp-shares'); dir.create({ idempotent: true }); const file = new File(dir, 'inventory-template.csv'); file.write(bytes); await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
    }); }} />
    <Button title="Choose completed CSV" secondary disabled={m.disabled} onPress={() => { void m.run(async signal => { const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'], copyToCacheDirectory: true }); if (!r.canceled && !signal.aborted) setSelected({ uri: r.assets[0].uri, name: r.assets[0].name }); }); }} />
    {selected && <Text style={styles.body}>Selected: {selected.name}</Text>}
    <Button title="Import selected CSV" disabled={m.disabled || !selected || !!result} busy={m.busy} onPress={() => { void m.run(async signal => { if (!selected) return; const file = new File(selected.uri); if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a CSV smaller than 10 MB.'); const body = new FormData(); body.append('file', file, selected.name); const r = await api.request('/api/team/inventory/bulk-upload', { method: 'POST', body, signal }); setResult(display(valueFrom(r))); }); }} />
  </FormScreen>;
}
