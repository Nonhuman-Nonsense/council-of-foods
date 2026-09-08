import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { Logger } from '@utils/Logger.js';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const mockBroadcaster = {
    broadcastConversationUpdate: vi.fn(),
    broadcastConversationEnd: vi.fn(),
    broadcastAudioUpdate: vi.fn(),
    broadcastError: vi.fn(),
    broadcastWarning: vi.fn(),
};

/**
 * Every generation shares one retry path, so each of these is exercised through
 * its own public entry point rather than through the helper directly — a caller
 * wired up the old way would still pass a test written against the helper.
 */
describe('DialogGenerator - generation retry', () => {
    let manager;
    let dialogGenerator;
    let mockCreate;

    /** Queues one model reply per call; the last one repeats. */
    const queueModelReplies = (...contents) => {
        let call = 0;
        mockCreate = vi.fn().mockImplementation(async () => {
            const content = contents[Math.min(call, contents.length - 1)];
            call++;
            return {
                id: `reply-${call}`,
                choices: [{ message: { content }, finish_reason: 'stop' }],
            };
        });
        vi.spyOn(manager.services, 'getOpenAI').mockReturnValue({
            chat: { completions: { create: mockCreate } },
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        const setup = createTestManager();
        manager = setup.manager;
        dialogGenerator = manager.dialogGenerator;
    });

    /** The three generations that reach the model, each through its own caller. */
    const entryPoints = [
        {
            name: 'council turn',
            run: (abort) =>
                dialogGenerator.generateResponse(
                    manager.meeting.characters[1],
                    manager.meeting,
                    1,
                    abort,
                ),
        },
        {
            name: 'chair interjection',
            run: () =>
                dialogGenerator.chairInterjection(
                    'Invite the human.',
                    0,
                    100,
                    manager.meeting,
                    mockBroadcaster,
                ),
        },
        {
            name: 'summary document',
            run: () => dialogGenerator.generateDocument('Write the protocol.', manager.meeting, 500),
        },
    ];

    describe.each(entryPoints)('$name', ({ run }) => {
        it('asks the model once when the first reply is usable', async () => {
            queueModelReplies('A complete thought.');

            const result = await run(() => false);

            expect(result.response).toBe('A complete thought.');
            expect(mockCreate).toHaveBeenCalledTimes(1);
            expect(Logger.warn).not.toHaveBeenCalled();
        });

        it('recovers when the model returns no content at all', async () => {
            queueModelReplies(null, 'Recovered on the second sample.');

            const result = await run(() => false);

            expect(result.response).toBe('Recovered on the second sample.');
            expect(mockCreate).toHaveBeenCalledTimes(2);
        });

        it('reports every empty sample, even when a retry saves the generation', async () => {
            queueModelReplies(null, 'Recovered.');

            await run(() => false);

            expect(Logger.warn).toHaveBeenCalledTimes(1);
            const [context, message] = Logger.warn.mock.calls[0];
            expect(context).toBe('DialogGenerator');
            expect(message).toContain('no content received');
            expect(message).toContain('attempt 1/');
        });

        it('gives up after exhausting its attempts, naming the generation', async () => {
            queueModelReplies(null);

            await expect(run(() => false)).rejects.toThrow(/No content received from the conversation model/);
            expect(mockCreate).toHaveBeenCalledTimes(4);
            expect(Logger.warn).toHaveBeenCalledTimes(4);
        });
    });

    it('stops retrying once the session aborts, rather than outliving it', async () => {
        queueModelReplies(null);
        let aborted = false;

        const result = await dialogGenerator.generateResponse(
            manager.meeting.characters[1],
            manager.meeting,
            1,
            () => {
                const wasAborted = aborted;
                aborted = true;
                return wasAborted;
            },
        );

        expect(result.response).toBe('');
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    /**
     * A reply the model did produce but post-processing trimmed to nothing is a
     * survivable turn, not a dead meeting — the caller writes an empty message
     * and the council moves on. Retried, but never fatal.
     */
    it('returns an empty turn rather than throwing when every reply is trimmed away', async () => {
        const otherSpeaker = manager.meeting.characters[2];
        queueModelReplies(`${otherSpeaker.name}: not my line`);

        const result = await dialogGenerator.generateResponse(
            manager.meeting.characters[1],
            manager.meeting,
            1,
            () => false,
        );

        expect(result.response).toBe('');
        expect(mockCreate).toHaveBeenCalledTimes(4);
        expect(Logger.warn.mock.calls[0][1]).toContain('entire message trimmed');
    });
});
