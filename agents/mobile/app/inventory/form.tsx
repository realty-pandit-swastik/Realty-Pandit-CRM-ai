import { useLocalSearchParams } from 'expo-router';
import { EditInventory, InventoryWizard } from '../../src/features/inventory/InventoryForm';
export default function Form() { const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>(); return id ? <EditInventory id={id} enrichment={mode === 'enrichment'} /> : <InventoryWizard />; }
