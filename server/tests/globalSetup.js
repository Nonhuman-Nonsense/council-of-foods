import { existsSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
    if (existsSync('.env')) {
        process.loadEnvFile('.env');
    }

    const mongod = await MongoMemoryServer.create({
        instance: {
            ip: '127.0.0.1',
            // Cursor sandbox blocks the optional unix domain socket in /tmp.
            // For tests we only need TCP localhost access.
            args: ['--nounixsocket'],
        },
    });

    process.env.COUNCIL_DB_URL = mongod.getUri();
    process.env.COUNCIL_DB_PREFIX = 'test_db';

    return async () => {
        await mongod.stop();
    };
}
