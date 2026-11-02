import { Stack, ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../src/features/auth/SessionProvider';
import { Button, Notice } from '../src/components/Controls';
import { colors, styles } from '../src/theme/tokens';

function Routes() {
  const { session } = useSession();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.navy, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Protected guard={!session}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(crm)" options={{ headerShown: false }} />
      <Stack.Screen name="lead/[phone]" options={{ title: 'Lead' }} />
            <Stack.Screen name="inventory/form" options={{ title: 'Inventory form' }} />
      <Stack.Screen name="inventory/actions" options={{ title: 'Property actions' }} />
      <Stack.Screen name="inventory/share" options={{ title: 'Share properties' }} />
      <Stack.Screen name="inventory/visit" options={{ title: 'Schedule visit' }} />
      <Stack.Screen name="inventory/bulk-upload" options={{ title: 'Bulk upload' }} />
      <Stack.Screen name="inventory/[id]" options={{ title: 'Property' }} />
      <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="task/new" options={{ title: 'New task' }} />
      <Stack.Screen name="task/edit" options={{ title: 'Edit task' }} />
      <Stack.Screen name="projects/index" options={{ title: 'Work projects' }} />
      <Stack.Screen name="projects/[id]" options={{ title: 'Work project' }} />
      <Stack.Screen name="projects/new" options={{ title: 'New project' }} />
      <Stack.Screen name="projects/edit" options={{ title: 'Edit project' }} />
      <Stack.Screen name="deals/index" options={{ title: 'Deal pipeline' }} />
      <Stack.Screen name="deals/[id]" options={{ title: 'Deal' }} />
      <Stack.Screen name="visits" options={{ title: 'Appointments' }} />
      <Stack.Screen name="visits/[id]" options={{ title: 'Appointment' }} />
      <Stack.Screen name="sessions" options={{ title: 'Device sessions' }} />
    </Stack.Protected>
  </Stack>;
}

export default function Layout() {
  return <SafeAreaProvider><SessionProvider><StatusBar style="dark" /><Routes /></SessionProvider></SafeAreaProvider>;
}
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={[styles.screen, styles.content]}><Notice error message="This screen could not open. Please try again." /><Button title="Try opening again" onPress={retry} /></View>;
}
