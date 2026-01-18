import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnvSchema } from '@models/EnvValidation.js';
import { insertMeeting, counters, initDb } from '@services/DbService.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Logger } from '@utils/Logger.js';

describe('Configuration & DB Error Handling', () => {
    let mongod;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        if (mongod) await mongod.stop();
        vi.restoreAllMocks();
    });

    describe('EnvSchema Validation', () => {
        it('should fail if COUNCIL_DB_URL is missing', () => {
            const result = EnvSchema.safeParse({
                COUNCIL_DB_PREFIX: 'TestDB',
                COUNCIL_OPENAI_API_KEY: 'sk-test',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.format().COUNCIL_DB_URL).toBeDefined();
            }
        });

        it('should fail if COUNCIL_DB_PREFIX is missing', () => {
            const result = EnvSchema.safeParse({
                COUNCIL_DB_URL: 'mongodb://localhost:27017',
                COUNCIL_OPENAI_API_KEY: 'sk-test',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.format().COUNCIL_DB_PREFIX).toBeDefined();
            }
        });

        it('should pass with valid config', () => {
            const result = EnvSchema.safeParse({
                COUNCIL_DB_URL: 'mongodb://localhost:27017',
                COUNCIL_DB_PREFIX: 'TestDB',
                COUNCIL_OPENAI_API_KEY: 'sk-test',
                GOOGLE_APPLICATION_CREDENTIALS: './google-credentials.json',
                INWORLD_API_KEY: 'test'
            });
            expect(result.success).toBe(true);
        });
    });

    describe('DbService Error Reporting', () => {
        // Setup mini in-memory DB for this specific test file
        beforeEach(async () => {
            mongod = await MongoMemoryServer.create();
            // Use distinct db name to avoid collisions
            await initDb(mongod.getUri(), "error_test_db_3");
        });

        it('should report error to errorbot if insertMeeting fails', async () => {
            // Spy on Logger.error to verify reporting
            const loggerSpy = vi.spyOn(Logger, 'error');

            // Simulate failure by forcing findOneAndUpdate to throw
            vi.spyOn(counters, 'findOneAndUpdate').mockRejectedValue(new Error('Simulated DB Failure'));

            // Attempt insert
            await expect(insertMeeting({
                date: new Date().toISOString(),
                conversation: [],
                options: {},
                audio: []
            })).rejects.toThrow('Simulated DB Failure');

            // Verify Logger.error was called
            // Logger.error(context, message, error)
            expect(loggerSpy).toHaveBeenCalledWith(
                "DbService",
                "Failed to insert meeting",
                expect.any(Error)
            );
        });
    });
});
