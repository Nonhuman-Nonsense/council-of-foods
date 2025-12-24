
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ValidationSchemas Environment Logic', () => {
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env.NODE_ENV;
        vi.resetModules();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    it('should ACCEPT options in prototype environment', async () => {
        process.env.NODE_ENV = 'prototype';

        // Dynamic import to enforce re-evaluation of the module after env change
        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const input = {
            topic: "Test",
            characters: [],
            options: { conversationMaxLength: 999 }
        };

        const result = SetupOptionsSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(result.data.options).toBeDefined();
        expect(result.data.options.conversationMaxLength).toBe(999);
    });

    it('should ACCEPT options in test environment', async () => {
        process.env.NODE_ENV = 'test';

        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const input = {
            topic: "Test",
            characters: [],
            options: { conversationMaxLength: 999 }
        };

        const result = SetupOptionsSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(result.data.options).toBeDefined();
    });

    it('should STRIP options in production environment', async () => {
        process.env.NODE_ENV = 'production';

        const { SetupOptionsSchema } = await import('@models/ValidationSchemas.js');

        const input = {
            topic: "Test",
            characters: [],
            options: { conversationMaxLength: 999 }
        };

        const result = SetupOptionsSchema.safeParse(input);
        expect(result.success).toBe(true);
        // In production, 'options' is not in the schema, so Zod strips it.
        // verification:
        expect(result.data.options).toBeUndefined();
    });
});
