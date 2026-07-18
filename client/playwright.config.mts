import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readServerPort, resolveDevPorts } from '../shared/devPorts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const serverEnv = loadEnv('development', path.resolve(rootDir, '../server'), '');
const ports = resolveDevPorts(readServerPort(serverEnv));

export default defineConfig({
    testDir: './tests/e2e/src',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: [['html', { outputFolder: 'tests/e2e/playwright-report' }]],
    outputDir: 'tests/e2e/test-results',
    use: {
        baseURL: `http://localhost:${ports.clientDev}`,
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: [
        {
            command: 'npm run dev',
            url: `http://localhost:${ports.clientDev}`,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'cd ../server && npm run e2e-server',
            url: `http://localhost:${ports.server}/health`,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'cd ../button/bridge && npm run dev:mock',
            url: 'http://127.0.0.1:8765/health',
            reuseExistingServer: !process.env.CI,
        },
    ],
});
