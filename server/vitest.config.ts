import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
        exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
        setupFiles: ['tests/setup.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../shared'),
            '@logic': path.resolve(__dirname, 'src/logic'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@models': path.resolve(__dirname, 'src/models'),
            '@interfaces': path.resolve(__dirname, 'src/interfaces'),
            '@root': path.resolve(__dirname, './'),
        },
    },
});
