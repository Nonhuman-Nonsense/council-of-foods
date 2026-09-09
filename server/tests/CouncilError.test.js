import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    BadRequestError,
    CapacityError,
    ConflictError,
    CouncilError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    UnauthorizedError,
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

    it('uses a single default client message for BadRequestError', () => {
        expect(new BadRequestError().clientMessage).toBe(BadRequestError.clientErrorMessage);
        expect(BadRequestError.clientErrorMessage).toBe('Invalid request');
    });

    it('omits debug in test/production environments', () => {
        mockConfig.NODE_ENV = 'test';
        expect(CouncilError.fromUnexpected(err).toErrorPayload('ctx')).toEqual({
            message: 'Internal Server Error',
            code: 500,
            errorKey: 'unexpected',
        });
        mockConfig.NODE_ENV = 'production';
        expect(CouncilError.fromUnexpected(err).toApiBody('ctx')).toEqual({
            message: 'Internal Server Error',
            errorKey: 'unexpected',
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
        const payload = CouncilError.fromZod(zodErr).toErrorPayload('socket abc');
        expect(payload.message).toBe('Invalid request');
        expect(payload.debug?.zodIssues).toBeDefined();
        expect(payload.debug?.context).toBe('socket abc');
    });

    it('does not attach debug for non-400/500 codes even in prototype', () => {
        mockConfig.NODE_ENV = 'prototype';
        expect(new NotFoundError().toErrorPayload('ctx')).toEqual({
            message: 'Meeting not found',
            code: 404,
            errorKey: 'notFound',
        });
    });

    it('does not attach debug without a debugCause', () => {
        mockConfig.NODE_ENV = 'prototype';
        expect(new InternalServerError().toErrorPayload()).toEqual({
            message: 'Internal Server Error',
            code: 500,
            errorKey: 'unexpected',
        });
    });
});

describe('CouncilError error keys', () => {
    it.each([
        { build: () => new BadRequestError(), expected: 'invalidRequest' },
        { build: () => new BadRequestError('Meeting already complete', { errorKey: 'meetingComplete' }), expected: 'meetingComplete' },
        { build: () => new ConflictError(), expected: 'elsewhere' },
        { build: () => new CapacityError(), expected: 'busy' },
        { build: () => new NotFoundError(), expected: 'notFound' },
        { build: () => new UnauthorizedError(), expected: 'unauthorized' },
        { build: () => new ForbiddenError(), expected: 'forbidden' },
        { build: () => CouncilError.fromUnexpected(new Error('boom')), expected: 'unexpected' },
        { build: () => CouncilError.fromUnexpected(new Error('boom'), 'Realtime call unavailable', 'realtimeUnavailable'), expected: 'realtimeUnavailable' },
    ])('carries errorKey $expected', ({ build, expected }) => {
        expect(build().toErrorPayload('ctx').errorKey).toBe(expected);
    });
});
