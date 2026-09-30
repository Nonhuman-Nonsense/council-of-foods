import { defineConfig } from 'vitest/config';
import { testEnv, commonExclude, commonInclude, dbBackedTests, resolve } from './vitest.shared.js';

export default defineConfig({
    test: {
        name: 'unit',
        globals: true,
        environment: 'node',
        env: testEnv,
        include: commonInclude,
        exclude: [...commonExclude, ...dbBackedTests],
        setupFiles: ['tests/unitSetup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
    resolve,
});
