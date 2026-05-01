import { beforeAll, beforeEach, afterAll } from 'vitest';
import { initDb, closeDb, meetingsCollection, audioCollection, counters } from '@services/DbService.js';

beforeAll(async () => {
    await initDb(process.env.COUNCIL_DB_URL, process.env.COUNCIL_DB_PREFIX);
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
