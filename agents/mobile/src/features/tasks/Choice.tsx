import { useState } from 'react';
import { Modal, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, FormScreen } from '../../components/Controls';
import { styles } from '../../theme/tokens';
import { label } from './contracts';

export function Choice<T extends string>({ title, value, options, onChange, disabled = false }: { title: string; value: T; options: readonly T[]; onChange: (value: T) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button title={`${title}: ${label(value)}`} secondary disabled={disabled} onPress={() => setOpen(true)} />
    <Modal visible={open} onRequestClose={() => setOpen(false)} animationType="none"><SafeAreaView style={styles.screen}><FormScreen>
      <Text style={styles.section}>{title}</Text>{options.map(option => <Button key={option} title={`${label(option)}${option === value ? ' (selected)' : ''}`} secondary={option !== value}
        onPress={() => { onChange(option); setOpen(false); }} />)}<Button title="Cancel" secondary onPress={() => setOpen(false)} />
    </FormScreen></SafeAreaView></Modal></>;
}
