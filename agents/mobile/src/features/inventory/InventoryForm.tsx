import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { array, object, optionalString, string } from '../../api/client';
import { Button, Field, FormScreen, Notice, Failure, Loading } from '../../components/Controls';
import { useApi } from '../auth/SessionProvider';
import { useRecord } from '../crm/useRecord';
import { AddressFields, SchemaFields, schemaFieldsFrom, Taxonomy } from './FormFields';
import { display, ensureSaved, fieldLabel, humanize, propertyFrom, savedIdentifier, Value, valueFrom } from './contracts';
import { useInventoryMutation } from './useInventoryMutation';
import { styles } from '../../theme/tokens';
import { WorkflowUpload } from './WorkflowUpload';
type Answers = Record<string, Value>;
type Option = { value: string; label: string };
function options(v: unknown): Option[] { return v == null ? [] : array(v, x => { const r = object(x); return { value: string(r.value), label: string(r.label) }; }); }
function stepResult(v: unknown) { const r = object(v), s = r.step ? object(r.step) : null; return { done: r.done === true, step: s ? { id: string(s.id), field: string(s.field), question: string(s.question), input: string(s.input_type), required: s.required === true, help: optionalString(s.help_text), secondary: optionalString(s.secondary_field), secondaryOptions: options(s.secondary_options) } : null, options: options(r.options), metadata: r.metadata ? object(r.metadata) : {} }; }
export function InventoryWizard() {
  const api = useApi(), m = useInventoryMutation(), [answers, setAnswers] = useState<Answers>({}), [state, setState] = useState<ReturnType<typeof stepResult> | null>(null), [history, setHistory] = useState<{ state: ReturnType<typeof stepResult>; answers: Answers }[]>([]), [value, setValue] = useState<Value>(''), [secondary, setSecondary] = useState(''), [summary, setSummary] = useState<Value | null>(null);
  const init = useRecord('inventory-workflow', 'start', '/api/workflow/definition', v => object(v));
  useEffect(() => { if (!init.data) return; const controller = new AbortController(); void api.request('/api/workflow/next-step', { method: 'POST', signal: controller.signal, body: JSON.stringify({ current_step_id: null, answers: {}, source: 'admin' }) }).then(v => { if (!controller.signal.aborted) setState(stepResult(v)); }).catch(() => {}); return () => controller.abort(); }, [api, init.data]);
  async function next(skip = false) {
    if (!state?.step) return;
    const step = state.step;
    await m.run(async signal => {
      if (!skip) { const validation = object(await api.request('/api/workflow/validate', { method: 'POST', signal, body: JSON.stringify({ step_id: step.id, value, answers }) })); if (validation.valid !== true) throw new Error(optionalString(validation.error) || 'Check this answer.'); }
      const updated = { ...answers, [step.field]: skip ? '__skip__' : value, ...(step.secondary ? { [step.secondary]: secondary } : {}) };
      const result = stepResult(await api.request('/api/workflow/next-step', { method: 'POST', signal, body: JSON.stringify({ current_step_id: step.id, answers: updated, source: 'admin' }) }));
      if (result.done) { const response = object(await api.request('/api/workflow/summary', { method: 'POST', signal, body: JSON.stringify({ answers: updated }) })); setSummary(valueFrom(response.summary)); }
      setHistory(h => [...h, { state, answers }]); setAnswers(updated); setState(result); setValue(''); setSecondary('');
    });
  }
  if (init.isPending) return <Loading />;
  if (init.isError) return <Failure error={init.error} retry={() => { void init.refetch(); }} />;
  if (!state) return <FormScreen><Notice message="Preparing inventory workflow…" /><Button title="Retry loading workflow" onPress={() => { void m.run(async signal => { setState(stepResult(await api.request('/api/workflow/next-step', { method: 'POST', signal, body: JSON.stringify({ current_step_id: null, answers: {}, source: 'admin' }) }))); }); }} />{m.error && <Notice error message={m.error} />}</FormScreen>;
  const step = state.step;
  const composite = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return <FormScreen><Text style={styles.heading}>Add property</Text><Text style={styles.muted}>Step {history.length + 1} · Server-guided inventory workflow</Text>{m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="The submission may have completed. Check inventory before submitting again." />}
    {state.done ? <><Text style={styles.section}>Review property</Text><Text selectable style={styles.body}>{display(summary)}</Text><Field label="Optional source partner phone" value={typeof answers.source_partner_phone === 'string' ? answers.source_partner_phone : ''} onChangeText={v => setAnswers(a => ({ ...a, source_partner_phone: v }))} keyboardType="phone-pad" /><Field label="Optional source partner name" value={typeof answers.source_partner_name === 'string' ? answers.source_partner_name : ''} onChangeText={v => setAnswers(a => ({ ...a, source_partner_name: v }))} /><Text style={styles.muted}>The server recognizes an existing partner or creates the source partner when you save.</Text>{['sell', 'sale'].includes(String(answers.intent)) && <><Button title={`Pre-rented: ${answers.pre_rented === 'true' ? 'Yes' : 'No'}`} secondary onPress={() => setAnswers(a => ({ ...a, pre_rented: a.pre_rented === 'true' ? 'false' : 'true' }))} />{answers.pre_rented === 'true' && <Field label="Current monthly rent" value={typeof answers.pre_rented_monthly_rent === 'string' ? answers.pre_rented_monthly_rent : ''} keyboardType="decimal-pad" onChangeText={v => setAnswers(a => ({ ...a, pre_rented_monthly_rent: v }))} />}</>}<Button title="Create property" busy={m.busy} disabled={m.disabled} onPress={() => Alert.alert('Create property?', 'Save this property to the CRM with the details shown above.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Create', onPress: () => { void m.run(async signal => { const r = ensureSaved(await api.request('/api/workflow/commit', { method: 'POST', signal, body: JSON.stringify({ answers, source: 'admin' }) })); const id = savedIdentifier(r, ['inventory_id']); router.replace({ pathname: '/inventory/[id]', params: { id } }); }); } }])} /></> : step && <>
      <Text style={styles.section}>{step.question}</Text>{step.help && <Text style={styles.muted}>{step.help}</Text>}
      {['owner_block', 'uploader_block'].includes(step.input) ? <>{(step.input === 'owner_block' ? ['owner_name', 'owner_phone'] : ['uploader_name', 'uploader_phone']).map(key => <Field key={key} label={humanize(key)} value={composite[key] == null ? '' : String(composite[key])} onChangeText={v => setValue({ ...composite, [key]: v })} />)}</> : step.input === 'taxonomy' ? <Taxonomy onSelect={setValue} /> : step.input === 'address_block' ? <AddressFields value={composite} onChange={setValue} /> : step.input === 'schema_fields' ? <SchemaFields fields={schemaFieldsFrom(state.metadata.schema_fields || [])} value={composite} onChange={setValue} /> : ['media_upload', 'video_upload', 'document_upload'].includes(step.input) ? <WorkflowUpload kind={step.input} value={value} onChange={setValue} disabled={m.disabled} /> : ['radio', 'dropdown', 'multi_select'].includes(step.input) ? <View style={{ gap: 8 }}>{state.options.map(o => <Button key={o.value} title={`${o.label}${value === o.value || (Array.isArray(value) && value.includes(o.value)) ? ' (selected)' : ''}`} secondary onPress={() => setValue(step.input === 'multi_select' ? Array.isArray(value) && value.includes(o.value) ? value.filter(v => v !== o.value) : [...(Array.isArray(value) ? value : []), o.value] : o.value)} />)}</View> : step.input === 'confirm' ? <Button title="Details are correct" secondary onPress={() => setValue('yes')} /> : <Field label={step.question} value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''} onChangeText={setValue} keyboardType={step.input === 'phone' ? 'phone-pad' : ['number', 'compound'].includes(step.input) ? 'decimal-pad' : 'default'} multiline={step.input === 'textarea'} />}
      {!!step.secondary && <View style={{ gap: 8 }}>{step.secondaryOptions.map(o => <Button key={o.value} title={`${o.label}${secondary === o.value ? ' (selected)' : ''}`} secondary onPress={() => setSecondary(o.value)} />)}</View>}
      <Button title="Continue" busy={m.busy} disabled={m.disabled} onPress={() => { void next(); }} />{!step.required && <Button title="Skip this optional step" secondary disabled={m.disabled} onPress={() => { void next(true); }} />}
    </>}
    {!!history.length && <Button title="Previous step" secondary disabled={m.disabled} onPress={() => { const previous = history[history.length - 1]; setState(previous.state); setAnswers(previous.answers); setValue(answers[previous.state.step!.field] ?? ''); setHistory(h => h.slice(0, -1)); }} />}
  </FormScreen>;
}
const editKeys = ['intent', 'description', 'price', 'price_unit', 'customer_price', 'display_price', 'key_holder_type', 'key_holder_name', 'key_holder_phone', 'owner_name', 'owner_phone', 'uploader_phone', 'uploader_name', 'lead_reference', 'commercial_use_type', 'pre_rented_monthly_rent'];
export function EditInventory({ id, enrichment = false }: { id: string; enrichment?: boolean }) {
  const q = useRecord('property-edit', id, `/api/inventory/${encodeURIComponent(id)}`, v => ({ p: propertyFrom(v), row: object(v) }));
  if (q.isPending) return <Loading />;
  if (!q.data) return <Failure error={q.error || new Error('Property could not be loaded.')} retry={() => { void q.refetch(); }} />;
  if (!q.data.p.actions.edit) return <Notice error message="You do not have permission to edit this property." />;
  return <EditableInventory key={id} id={id} enrichment={enrichment} initial={q.data} />;
}
function EditableInventory({ id, enrichment, initial }: { id: string; enrichment: boolean; initial: { p: ReturnType<typeof propertyFrom>; row: Record<string, unknown> } }) {
  const api = useApi(), m = useInventoryMutation();
  const [original] = useState<Answers>(() => {
    const keys = [...editKeys, 'renovated', 'roof_rights', 'pre_rented', 'commercial_use', 'flat_no', 'plot_no', 'apartment_name', 'city', 'district', 'locality', 'sub_locality', 'state', 'pincode', 'floor_number', 'floor_label', 'display_floor', 'latitude', 'longitude', 'full_address'];
    return Object.fromEntries(keys.filter(k => initial.row[k] !== undefined).map(k => [k, valueFrom(initial.row[k])]));
  });
  const [fields, setFields] = useState<Answers>(original);
  const [specs, setSpecs] = useState<Answers>(initial.p.specs), [node, setNode] = useState(optionalString(initial.row.taxonomy_node_id) || ''), [review, setReview] = useState(false);
  const base = optionalString(initial.row.updated_at) || '';
  const schema = useRecord('inventory-fields', node || 'none', node ? `/public/taxonomy/nodes/${encodeURIComponent(node)}/fields` : '/public/taxonomy/tree', v => node ? schemaFieldsFrom(object(v).fields) : []);
  return <FormScreen><Text style={styles.heading}>{enrichment ? 'Enrich property' : 'Edit property'}</Text><Text style={styles.body}>{initial.p.title}</Text>{m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="The save may have completed. Refresh the property before another edit." />}
    {review ? <><Text style={styles.section}>Review changes</Text><Text selectable style={styles.body}>{display({ ...fields, specs })}</Text><Button title="Save property" busy={m.busy} disabled={m.disabled} onPress={() => { void m.run(async signal => { const fresh = object(await api.request(`/api/inventory/${encodeURIComponent(id)}`, { signal })); if (base && fresh.updated_at !== base) throw new Error('This property changed since editing began. Return and reload before saving.'); const changes: Answers = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original[key])); if (JSON.stringify(specs) !== JSON.stringify(initial.p.specs)) changes.specs = specs; if (node !== (initial.row.taxonomy_node_id || '')) changes.taxonomy_node_id = node; if (!Object.keys(changes).length) throw new Error('No values have changed. Continue editing to make a change.'); ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(id)}`, { method: 'PATCH', signal, body: JSON.stringify(changes) })); router.dismissTo({ pathname: '/inventory/[id]', params: { id } }); }); }} /><Button title="Continue editing" secondary onPress={() => setReview(false)} /></> : <>
      {!enrichment && <><Text style={styles.section}>Classification</Text><Text style={styles.muted}>Current type: {initial.p.type}</Text><Taxonomy onSelect={id => { setNode(id); setSpecs({}); }} /><AddressFields value={fields} onChange={setFields} /></>}
      <Text style={styles.section}>Taxonomy specifications</Text>{schema.isPending ? <Loading /> : schema.isError ? <Failure error={schema.error} retry={() => { void schema.refetch(); }} /> : <SchemaFields fields={schema.data || []} value={specs} onChange={setSpecs} />}
      {editKeys.map(k => <Field key={k} label={fieldLabel(k)} value={fields[k] == null ? '' : String(fields[k])} onChangeText={v => setFields(f => ({ ...f, [k]: v }))} multiline={k === 'description'} />)}
      {['renovated', 'roof_rights', 'pre_rented', 'commercial_use'].map(k => <Button key={k} title={`${humanize(k)}: ${display(fields[k])}`} secondary onPress={() => setFields(f => ({ ...f, [k]: fields[k] !== true }))} />)}
      <Button title="Review changes" disabled={m.disabled || schema.isError} onPress={() => setReview(true)} />
    </>}
  </FormScreen>;
}
