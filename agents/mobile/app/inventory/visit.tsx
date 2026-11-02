import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ensureSaved, savedIdentifier } from '../../src/features/inventory/contracts';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Field, FormScreen, Notice } from '../../src/components/Controls';
import { Members } from '../../src/features/inventory/Members';
import { useInventoryMutation } from '../../src/features/inventory/useInventoryMutation';
import { styles } from '../../src/theme/tokens';
export default function Visit() {
  const { id } = useLocalSearchParams<{ id: string }>(), api = useApi(), { session } = useSession(), m = useInventoryMutation();
  const [phone, setPhone] = useState(''), [name, setName] = useState(''), [date, setDate] = useState(''), [duration, setDuration] = useState('30'), [notes, setNotes] = useState(''), [agents, setAgents] = useState<string[]>(session ? [session.agent.id] : []);
  return <FormScreen><Text style={styles.heading}>Schedule a property visit</Text><Field label="CRM contact phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Field label="Client name" value={name} onChangeText={setName} /><Field label="Visit date and time (ISO, with timezone)" value={date} onChangeText={setDate} placeholder="2026-10-20T10:00:00+05:30" /><Field label="Duration in minutes" value={duration} onChangeText={setDuration} keyboardType="number-pad" /><Members selected={agents} onChange={setAgents} /><Field label="Notes" value={notes} onChangeText={setNotes} multiline />
    {m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="This visit may have been saved. Check appointments before creating another." />}
    <Button title="Book visit" busy={m.busy} disabled={m.disabled || !phone || !date || !agents.length} onPress={() => { void m.run(async signal => { const scheduled = new Date(date); if (!Number.isFinite(scheduled.getTime())) throw new Error('Enter a valid date and time including timezone.'); const r = ensureSaved(await api.request('/api/calendar/appointments', { method: 'POST', signal, body: JSON.stringify({ title: 'Property visit', type: 'property_visit', source: 'manual', channel: 'admin', contact_id: phone, description: name, scheduled_at: scheduled.toISOString(), duration: Number(duration), property_id: id, assigned_to_agent_id: agents[0], notes }) })); const appointmentId = savedIdentifier(r.appointment || r); router.replace({ pathname: '/visits/[id]', params: { id: appointmentId } }); }); }} />
  </FormScreen>;
}
