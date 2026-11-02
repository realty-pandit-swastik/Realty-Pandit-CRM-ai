import { requireOptionalNativeModule } from 'expo-modules-core';
export const InventoryShare = requireOptionalNativeModule<{ shareAsync(uris: string[], mime: string, text: string, app: string): Promise<string>; revoke(): void }>('InventoryShare');
