import { defineConfig } from 'vitest/config';
import { commonExclude, commonInclude, dbBackedTests, resolve } from './vitest.shared.js';

export default defineConfig({
    test: {
        name: 'unit',
        globals: true,
        environment: 'node',
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
