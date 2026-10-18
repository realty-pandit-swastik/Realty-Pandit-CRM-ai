import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/integration/mobile*.test.ts'],
        setupFiles: ['./src/integration/mobile_setup.ts'],
        fileParallelism: false,
        testTimeout: 15000,
        hookTimeout: 30000,
    },
});
