import { StyleSheet } from 'react-native';

export const colors = {
  navy: '#10243A', teal: '#087F75', white: '#FFFFFF', background: '#F7F9FB', slate: '#526174',
  border: '#D6DEE6', selected: '#E3F2EF', error: '#A62632', errorBackground: '#FFF1F2',
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  heading: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.navy },
  section: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.navy },
  body: { fontSize: 16, lineHeight: 23, color: colors.navy },
  muted: { fontSize: 14, lineHeight: 21, color: colors.slate },
  label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.navy },
  field: { minHeight: 52, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.navy },
  row: { paddingVertical: 18, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 5, backgroundColor: colors.white, minHeight: 72 },
  toolbar: { padding: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
