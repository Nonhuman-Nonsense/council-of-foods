import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
        setupFiles: ['./tests/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});
