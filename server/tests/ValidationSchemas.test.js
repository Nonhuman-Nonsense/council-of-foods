import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const baseSetupOptions = () => ({
    meetingId: 1,
    creatorKey: 'creator-key',
    serverOptions: { conversationMaxLength: 999 }
});

describe('ValidationSchemas — SetupOptionsSchema (serverOptions safety)', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env.NODE_ENV;
        vi.resetModules();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    it('should ACCEPT serverOptions in prototype environment', async () => {
        process.env.NODE_ENV = 'prototype';

        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const result = SetupOptionsSchema.safeParse(baseSetupOptions());
        expect(result.success).toBe(true);
        expect(result.data.serverOptions).toBeDefined();
        expect(result.data.serverOptions.conversationMaxLength).toBe(999);
    });

    it('should ACCEPT serverOptions in test environment', async () => {
        process.env.NODE_ENV = 'test';

        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const result = SetupOptionsSchema.safeParse(baseSetupOptions());
        expect(result.success).toBe(true);
        expect(result.data.serverOptions).toBeDefined();
        expect(result.data.serverOptions.conversationMaxLength).toBe(999);
    });

    it('should STRIP serverOptions in production environment', async () => {
        process.env.NODE_ENV = 'production';

        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const result = SetupOptionsSchema.safeParse(baseSetupOptions());
        expect(result.success).toBe(true);
        expect(result.data.serverOptions).toBeUndefined();
    });
});
