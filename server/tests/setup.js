import { beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { initDb, meetingsCollection, audioCollection } from '../src/services/DbService.js';

let mongod;

beforeAll(async () => {
    // 1. Start In-Memory DB
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // 2. Override Environment
    process.env.COUNCIL_DB_URL = uri;
    process.env.COUNCIL_DB_PREFIX = "test_db";

    // 3. Initialize App DB connection
    await initDb();
});

beforeEach(async () => {
    // Clear data between tests
    if (meetingsCollection) await meetingsCollection.deleteMany({});
    if (audioCollection) await audioCollection.deleteMany({});
});

afterAll(async () => {
    if (mongod) await mongod.stop();
});
