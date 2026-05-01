import { defineConfig } from 'vitest/config';
import { commonExclude, dbBackedTests, resolve } from './vitest.shared.js';

export default defineConfig({
    test: {
        name: 'integration',
        globals: true,
        environment: 'node',
        include: dbBackedTests,
        exclude: commonExclude,
        globalSetup: ['tests/globalSetup.js'],
        setupFiles: ['tests/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
    resolve,
});
