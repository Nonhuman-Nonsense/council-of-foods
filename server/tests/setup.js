import './classifierMock.setup.js';
import { beforeAll, beforeEach, afterAll, vi } from 'vitest';
import {
    initDb, closeDb, meetingsCollection, audioCollection, counters,
    roomPowerCollection, roomPowerHoursCollection, lettersCollection, letterBlocklistCollection, letterRepliesCollection,
} from '@services/DbService.js';
import { TEST_MODES } from '@interfaces/TestModes.js';

vi.mock('@services/ConversationService.js', async () => {
    const actual = await vi.importActual('@services/ConversationService.js');
    const mode = process.env.TEST_MODE || TEST_MODES.MOCK;

    if (mode === TEST_MODES.FAST || mode === TEST_MODES.FULL) {
        return actual;
    }

    return {
        ...actual,
        createConversationService: (getOpenAI) => ({
            createChatCompletion: async ({
                messages,
                model,
                maxCompletionTokens,
                temperature,
                reasoning,
                stop,
            }) => {
                const request = {
                    messages,
                    model,
                    max_completion_tokens: maxCompletionTokens,
                    temperature,
                    stop,
                };
                if (reasoning && reasoning !== 'none') {
                    request.reasoning_effort = reasoning;
                }
                const completion = await getOpenAI().chat.completions.create(request);

                return {
                    id: completion.id ?? null,
                    content: completion.choices?.[0]?.message?.content ?? null,
                    finishReason: completion.choices?.[0]?.finish_reason ?? 'stop',
                };
            },
        }),
    };
});

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
    // Test files share a worker's database: what one leaves (a room power reading, a letter)
    // must not reach the next — the meter once read another file's plug.
    for (const collection of [roomPowerCollection, roomPowerHoursCollection, lettersCollection, letterBlocklistCollection, letterRepliesCollection]) {
        if (collection) await collection.deleteMany({});
    }
});

afterAll(async () => {
    await closeDb();
});
