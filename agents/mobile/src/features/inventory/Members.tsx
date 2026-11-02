import { Text, View } from 'react-native';
import { array, object, string } from '../../api/client';
import { Button, Failure, Loading } from '../../components/Controls';
import { useRecord } from '../crm/useRecord';
import { styles } from '../../theme/tokens';
export function Members({ selected, onChange, multiple = false }: { selected: string[]; onChange: (ids: string[]) => void; multiple?: boolean }) {
  const q = useRecord('inventory-members', 'active', '/api/team/members-list', v => array(v, e => { const r = object(e); return { id: string(r.id), name: string(r.name), role: string(r.role) }; }));
  return <View style={{ gap: 8 }}><Text style={styles.label}>Choose {multiple ? 'team members' : 'a team member'}</Text>{q.isPending ? <Loading /> : q.isError ? <Failure error={q.error} retry={() => { void q.refetch(); }} /> : q.data?.map(m => <Button key={m.id} title={`${m.name} · ${m.role}${selected.includes(m.id) ? ' (selected)' : ''}`} secondary={!selected.includes(m.id)} onPress={() => onChange(multiple ? selected.includes(m.id) ? selected.filter(id => id !== m.id) : [...selected, m.id] : [m.id])} />)}</View>;
}
