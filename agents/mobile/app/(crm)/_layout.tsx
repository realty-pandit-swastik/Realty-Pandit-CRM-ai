import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../src/theme/tokens';

export default function Layout() {
  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.teal, tabBarInactiveTintColor: colors.slate,
    headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.navy, tabBarStyle: { backgroundColor: colors.white } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home', tabBarIcon: ({ color, size }) => <Ionicons accessible={false} importantForAccessibility="no" name="home-outline" color={typeof color === 'string' ? color : colors.slate} size={size} /> }} />
    <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarAccessibilityLabel: 'Leads', tabBarIcon: ({ color, size }) => <Ionicons accessible={false} importantForAccessibility="no" name="people-outline" color={typeof color === 'string' ? color : colors.slate} size={size} /> }} />
    <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarAccessibilityLabel: 'Inventory', tabBarIcon: ({ color, size }) => <Ionicons accessible={false} importantForAccessibility="no" name="business-outline" color={typeof color === 'string' ? color : colors.slate} size={size} /> }} />
    <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarAccessibilityLabel: 'Tasks', tabBarIcon: ({ color, size }) => <Ionicons accessible={false} importantForAccessibility="no" name="checkbox-outline" color={typeof color === 'string' ? color : colors.slate} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarAccessibilityLabel: 'More', tabBarIcon: ({ color, size }) => <Ionicons accessible={false} importantForAccessibility="no" name="menu-outline" color={typeof color === 'string' ? color : colors.slate} size={size} /> }} />
  </Tabs>;
}
