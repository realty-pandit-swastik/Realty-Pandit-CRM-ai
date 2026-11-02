import { useState } from 'react';
import { Text, View } from 'react-native';
import { array, object, optionalString, string } from '../../api/client';
import { Button, Field, Failure, Loading } from '../../components/Controls';
import { useRecord } from '../crm/useRecord';
import { display, humanize, Value } from './contracts';
import { Choice } from '../tasks/Choice';
import { styles } from '../../theme/tokens';
export type SchemaField = { key: string; label: string; input: string; required: boolean; options: string[]; unit?: string };
export function schemaFieldsFrom(value: unknown): SchemaField[] { return array(value, v => { const r = object(v); return { key: string(r.key), label: string(r.label), input: string(r.input_type), required: r.required === true, options: r.options ? array(r.options, string) : [], unit: optionalString(r.unit) }; }); }
export function SchemaFields({ fields, value, onChange }: { fields: SchemaField[]; value: Record<string, Value>; onChange: (value: Record<string, Value>) => void }) {
  return <>{fields.map(f => { const current = value[f.key]; const selected = Array.isArray(current) ? current : []; return <View key={f.key} style={{ gap: 8 }}><Text style={styles.label}>{f.label}{f.required ? ' *' : ''}{f.unit ? ` (${f.unit})` : ''}</Text>{f.options.length ? f.options.map(o => <Button key={o} title={`${o}${value[f.key] === o || (selected.includes(o)) ? ' (selected)' : ''}`} secondary onPress={() => onChange({ ...value, [f.key]: f.input === 'multiselect' ? selected.includes(o) ? selected.filter(v => v !== o) : [...selected, o] : o })} />) : f.input === 'boolean' ? <Button title={`${f.label}: ${display(current)}`} secondary onPress={() => onChange({ ...value, [f.key]: current !== true })} /> : f.input === 'parking_list' ? <Parking value={value[f.key]} onChange={v => onChange({ ...value, [f.key]: v })} /> : <Field label={f.label} value={value[f.key] == null ? '' : String(value[f.key])} keyboardType={f.input === 'number' ? 'decimal-pad' : 'default'} onChangeText={v => onChange({ ...value, [f.key]: v })} />}</View>; })}</>;
}
function Parking({ value, onChange }: { value: Value | undefined; onChange: (v: Value) => void }) {
  const rows = Array.isArray(value) ? value : [];
  return <>{rows.map((row, index) => { const entry = row && typeof row === 'object' && !Array.isArray(row) ? row : {}; return <View key={index} style={{ gap: 8 }}><Text style={styles.muted}>Parking space {index + 1}</Text>{(['allocation', 'type'] as const).map(key => <Choice key={key} title={humanize(key)} value={typeof entry[key] === 'string' ? entry[key] : 'Not specified'} options={key === 'allocation' ? ['Not specified', 'Reserved', 'Common'] : ['Not specified', 'Covered', 'Open']} onChange={v => onChange(rows.map((r, i) => i === index ? { ...entry, [key]: v === 'Not specified' ? null : v } : r))} />)}<Button title={`Remove parking ${index + 1}`} secondary onPress={() => onChange(rows.filter((_, i) => i !== index))} /></View>; })}<Button title="Add parking" secondary onPress={() => onChange([...rows, {}])} /></>;
}
export const addressKeys = ['city', 'district', 'locality', 'sub_locality', 'state', 'pincode', 'apartment_name', 'flat_no', 'plot_no', 'floor_number', 'floor_label', 'display_floor', 'latitude', 'longitude', 'full_address'];
export function AddressFields({ value, onChange }: { value: Record<string, Value>; onChange: (v: Record<string, Value>) => void }) { return <>{addressKeys.map(key => <Field key={key} label={humanize(key)} value={value[key] == null ? '' : String(value[key])} onChangeText={v => onChange({ ...value, [key]: v })} />)}</>; }
type Node = { id: string; name: string; children: Node[] };
function nodeFrom(v: unknown): Node { const r = object(v); return { id: string(r.id), name: string(r.name), children: r.children ? array(r.children, nodeFrom) : [] }; }
export function Taxonomy({ onSelect }: { onSelect: (id: string) => void }) {
  const [path, setPath] = useState<Node[]>([]), q = useRecord('taxonomy', 'tree', '/public/taxonomy/tree', v => array(object(v).tree, nodeFrom));
  if (q.isPending) return <Loading />; if (q.isError) return <Failure error={q.error} retry={() => { void q.refetch(); }} />;
  const last = path[path.length - 1], nodes = last ? last.children : q.data || [];
  return <View style={{ gap: 8 }}><Text style={styles.muted}>{path.map(n => n.name).join(' / ') || 'Choose a category'}</Text>{nodes.map(n => <Button key={n.id} title={n.name} secondary onPress={() => { setPath(p => [...p, n]); if (!n.children.length) onSelect(n.id); }} />)}{last && <Button title="Back to parent category" secondary onPress={() => setPath(p => p.slice(0, -1))} />}</View>;
}
