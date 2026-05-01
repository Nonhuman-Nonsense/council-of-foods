import { MongoMemoryServer } from 'mongodb-memory-server';
import dotenv from 'dotenv';

export default async function globalSetup() {
    dotenv.config();

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
