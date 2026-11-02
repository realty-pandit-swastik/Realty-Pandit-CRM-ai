import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Button, Notice, Row } from '../../src/components/Controls';
import { useSession } from '../../src/features/auth/SessionProvider';
import { styles } from '../../src/theme/tokens';
export default function More() {
  const { session, controller, offline } = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const logout = async () => { setBusy(true); setError(''); try { await controller!.logout(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not revoke this session. Try again.'); } finally { setBusy(false); } };
  return <ScrollView style={styles.screen}><View style={styles.content}><Text style={styles.heading}>{session!.agent.name}</Text><Text style={styles.muted}>{session!.agent.role.replaceAll('_', ' ')} · {session!.agent.email}</Text></View>
    {session!.agent.permissions.includes('view_deals') && <Row title="Deal pipeline" subtitle="Review deals and update stages" onPress={() => router.push('/deals')} />}
    <Row title="Appointments" subtitle="Your visits and meetings" onPress={() => router.push('/visits')} />
    <Row title="Work projects" subtitle="Projects and linked tasks" onPress={() => router.push('/projects')} />
    <Row title="Device sessions" subtitle="Review and revoke signed-in devices" onPress={() => router.push('/sessions')} />
    <View style={styles.content}>{!!error && <Notice error message={error} />}<Button title="Sign out" busy={busy} disabled={offline} secondary onPress={() => Alert.alert('Sign out of this device?', 'Local drafts and downloaded share files will be deleted. Save any work you want to keep first.', [
      { text: 'Keep working', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
    ])} />
      {offline && <Text style={styles.muted}>Connect to revoke this device session and sign out.</Text>}
    </View>
  </ScrollView>;
}
