const path = require('node:path');
const coreRoot = path.dirname(require.resolve('expo-modules-core/package.json', { paths: [require.resolve('expo/package.json')] }));
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
  clearMocks: true,
  moduleNameMapper: {
    // SDK 58 keeps this module inside expo; resolve the SDK's copy for the Jest preset.
    '^expo-modules-core$': require.resolve('expo-modules-core', { paths: [require.resolve('expo/package.json')] }),
    '^expo-modules-core/(.*)$': `${coreRoot}/$1`,
  },
};
