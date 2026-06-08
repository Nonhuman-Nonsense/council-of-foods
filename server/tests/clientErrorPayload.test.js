import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    CouncilError,
    InternalServerError,
    NotFoundError,
} from '@models/Errors.js';

const mockConfig = vi.hoisted(() => ({ NODE_ENV: 'test' }));

vi.mock('../src/config.js', () => ({
    config: mockConfig,
}));

describe('CouncilError client payloads', () => {
    const err = new Error('boom');

    beforeEach(() => {
        mockConfig.NODE_ENV = 'test';
    });

    it('omits debug in test/production environments', () => {
        mockConfig.NODE_ENV = 'test';
        expect(CouncilError.fromUnexpected(err).toErrorPayload('ctx')).toEqual({
            message: 'Internal Server Error',
            code: 500,
        });
        mockConfig.NODE_ENV = 'production';
        expect(CouncilError.fromUnexpected(err).toApiBody('ctx')).toEqual({
            message: 'Internal Server Error',
        });
    });

    it('includes stack and context for 500 in prototype', () => {
        mockConfig.NODE_ENV = 'prototype';
        const payload = CouncilError.fromUnexpected(err).toErrorPayload('meeting 1');
        expect(payload.message).toBe('Internal Server Error');
        expect(payload.code).toBe(500);
        expect(payload.debug?.stack).toContain('boom');
        expect(payload.debug?.context).toBe('meeting 1');
    });

    it('includes zod issues for 400 in development', () => {
        mockConfig.NODE_ENV = 'development';
        const zodErr = z.object({ id: z.number() }).safeParse({ id: 'x' }).error;
        const payload = CouncilError.fromZod(zodErr, 'Invalid Input').toErrorPayload('socket abc');
        expect(payload.debug?.zodIssues).toBeDefined();
        expect(payload.debug?.context).toBe('socket abc');
    });

    it('does not attach debug for non-400/500 codes even in prototype', () => {
        mockConfig.NODE_ENV = 'prototype';
        expect(new NotFoundError().toErrorPayload('ctx')).toEqual({
            message: 'Meeting not found',
            code: 404,
        });
    });

    it('does not attach debug without a debugCause', () => {
        mockConfig.NODE_ENV = 'prototype';
        expect(new InternalServerError().toErrorPayload()).toEqual({
            message: 'Internal Server Error',
            code: 500,
        });
    });
});
