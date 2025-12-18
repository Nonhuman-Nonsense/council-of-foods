import { beforeAll, beforeEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { initDb, meetingsCollection, audioCollection } from '@services/DbService.js';
import dotenv from 'dotenv';

// Load env vars from .env file
dotenv.config();

let mongod;

beforeAll(async () => {
    // 1. Start In-Memory DB
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // 2. Override Environment (optional, but good for other components reading env)
    process.env.COUNCIL_DB_URL = uri;
    process.env.COUNCIL_DB_PREFIX = "test_db";

    // 3. Initialize App DB connection with overrides
    await initDb(uri, "test_db");
});

beforeEach(async () => {
    // Clear data between tests
    if (meetingsCollection) await meetingsCollection.deleteMany({});
    if (audioCollection) await audioCollection.deleteMany({});
});

afterAll(async () => {
    if (mongod) await mongod.stop();
});
