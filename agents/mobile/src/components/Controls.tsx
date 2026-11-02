import { PropsWithChildren, useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, styles } from '../theme/tokens';

export function Button({ title, onPress, busy = false, disabled = false, secondary = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [local.button, { backgroundColor: secondary ? colors.white : colors.teal, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, secondary && local.outline]}>
    {busy && <ActivityIndicator color={secondary ? colors.teal : colors.white} />}
    <Text style={[local.buttonText, { color: secondary ? colors.teal : colors.white }]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 7 }}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.slate}
    onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }}
    style={[styles.field, focused && { borderColor: colors.teal, borderWidth: 2 }, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, props.style]} /></View>;
}

export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <View accessibilityLiveRegion="polite" style={[local.notice, error && { backgroundColor: colors.errorBackground }]}>
    <Text style={[styles.body, error && { color: colors.error }]}>{message}</Text>
  </View>;
}

export function Loading({ label = 'Loading records…' }: { label?: string }) {
  return <View style={{ padding: 20, gap: 14 }} accessibilityRole="progressbar" accessibilityLabel={label}>
    <Text style={styles.muted}>{label}</Text>{[0, 1, 2].map(index => <View key={index} style={{ height: 64, backgroundColor: colors.border, borderRadius: 6, opacity: 0.45 }} />)}
  </View>;
}

export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return <View style={{ padding: 20, gap: 16 }}><Notice message={error.message} error /><Button title="Try again" onPress={retry} secondary /></View>;
}

export function FormScreen({ children }: PropsWithChildren) {
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}

export function Row({ title, subtitle, detail, onPress }: { title: string; subtitle?: string; detail?: string; onPress?: () => void }) {
  const content = <><Text style={[styles.body, { fontWeight: '600' }]}>{title}</Text>{subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}{detail ? <Text style={styles.muted}>{detail}</Text> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.selected }]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

const local = StyleSheet.create({
  button: { minHeight: 52, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  outline: { borderWidth: 1, borderColor: colors.teal },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  notice: { padding: 14, borderRadius: 8, backgroundColor: colors.selected },
});
