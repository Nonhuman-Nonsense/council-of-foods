import { beforeAll, beforeEach, afterAll } from 'vitest';
import { initDb, closeDb, meetingsCollection, audioCollection, counters } from '@services/DbService.js';

const baseDbPrefix = process.env.COUNCIL_DB_PREFIX || 'test_db';
const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || `${process.pid}`;
const workerDbPrefix = `${baseDbPrefix}_${workerId}`;

beforeAll(async () => {
    process.env.COUNCIL_DB_PREFIX = workerDbPrefix;
    await initDb(process.env.COUNCIL_DB_URL, workerDbPrefix);
});

beforeEach(async () => {
    if (meetingsCollection) await meetingsCollection.deleteMany({});
    if (audioCollection) await audioCollection.deleteMany({});
    if (counters) {
        await counters.deleteMany({});
        await counters.insertOne({ _id: 'meeting_id', seq: 0 });
    }
});

afterAll(async () => {
    await closeDb();
});
