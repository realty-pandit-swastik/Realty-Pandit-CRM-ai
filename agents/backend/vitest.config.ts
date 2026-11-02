import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./src/__tests__/setup.ts'],
        include: ['src/**/*.test.ts'],
        exclude: ['src/integration/**'], // Real database/auth tests use vitest.mobile-integration.config.ts.
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: ['src/__tests__/**', 'src/scripts/**'],
        },
        testTimeout: 10000,
    },
});
