import { View } from 'react-native';
import { Loading, Notice } from '../../components/Controls';
import { useSession } from '../auth/SessionProvider';
import { styles } from '../../theme/tokens';

export function RecordLoading() {
  const { offline } = useSession();
  return offline ? <View style={styles.content}><Notice message="You’re offline. Reconnect to load this record, or go back to records already loaded." /></View> : <Loading />;
}
