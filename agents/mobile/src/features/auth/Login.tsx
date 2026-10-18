import { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, FormScreen, Notice } from '../../components/Controls';
import { colors, styles } from '../../theme/tokens';
import { useSession } from './SessionProvider';
import { ApiError } from '../../api/client';

export default function Login() {
  const { controller, configurationError, offline } = useSession();
  const [phone, setPhone] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const login = async () => {
    if (!controller || busy) return;
    setBusy(true); setError('');
    try { await controller.login(phone.trim(), password, `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} · Realty Pandit`); }
    catch (failure) { setError(failure instanceof ApiError && failure.ambiguous ? 'Could not sign in. Check your connection and try again.' : failure instanceof Error ? failure.message : 'Could not sign in. Try again.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.screen}><FormScreen>
    <View style={{ gap: 16, paddingTop: 28, paddingBottom: 12 }}>
      <Image source={require('../../../assets/realty-pandit.png')} accessibilityLabel="Realty Pandit" style={{ width: 72, height: 72, borderRadius: 12 }} />
      <Text style={styles.heading}>Your next move,{ '\n' }in one place.</Text>
      <Text style={styles.body}>Sign in to Realty Pandit to follow up with leads, manage properties and keep visits on track.</Text>
    </View>
    {configurationError && <Notice error message={configurationError.message} />}
    {offline && <Notice message="You’re offline. Connect to sign in securely." />}
    <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="username" autoComplete="tel" autoCorrect={false} placeholder="Registered phone number" editable={!busy} />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="go" editable={!busy} onSubmitEditing={() => { if (phone.trim() && password) void login(); }} />
    {!!error && <Notice error message={error} />}
    <Button title="Sign in" busy={busy} disabled={!phone.trim() || !password || !!configurationError || offline} onPress={() => { void login(); }} />
    <Text style={[styles.muted, { color: colors.slate }]}>Use your staff account. Contact your administrator if you need access or a password reset.</Text>
  </FormScreen></SafeAreaView>;
}
