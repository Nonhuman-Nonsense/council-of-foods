import path from 'path';

export const commonInclude = ['tests/**/*.test.js', 'tests/**/*.test.ts'];
export const commonExclude = ['node_modules', 'dist', '.idea', '.git', '.cache'];

export const dbBackedTests = [
    'tests/**/*.integration.test.js',
    'tests/**/*.integration.test.ts',
    'tests/AudioDrain.test.js',
    'tests/Concurrency.test.js',
    'tests/ConfigurationAndDbErrors.test.js',
    'tests/reportMaximumPlayedIndex.test.ts',
    'tests/resumeMeeting.test.ts',
];

export const resolve = {
    alias: {
        '@shared': path.resolve(import.meta.dirname, '../shared'),
        '@logic': path.resolve(import.meta.dirname, 'src/logic'),
        '@services': path.resolve(import.meta.dirname, 'src/services'),
        '@utils': path.resolve(import.meta.dirname, 'src/utils'),
        '@models': path.resolve(import.meta.dirname, 'src/models'),
        '@interfaces': path.resolve(import.meta.dirname, 'src/interfaces'),
        '@api': path.resolve(import.meta.dirname, 'src/api'),
        '@root': path.resolve(import.meta.dirname, './'),
    },
};
