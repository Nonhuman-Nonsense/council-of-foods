import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { buildReplayMeetingManifest, buildResumeConversation } from '@api/replayManifest.js';
import { MockFactory } from './factories/MockFactory.ts';

/**
 * The letter ending (docs/council-letters.md → "The meeting ending"): the chair's closing line
 * hands over to an author, the author announces the letter, the human is asked to add something,
 * and the letter becomes the summary, read by its author — or, where the installation prints its
 * letters, the chair says farewell and the meeting ends on the credits, with the letter after
 * them for replay. Each step ends in a durable marker, so a
 * reconnect at any of them resumes there (RESILIENCE.md). The letter steps themselves are mocked:
 * these tests are about the flow, not the writing.
 */

const letterSteps = vi.hoisted(() => ({
    pickAuthor: vi.fn(),
    planLetter: vi.fn(),
    draftLetter: vi.fn(),
    sortHumanAddition: vi.fn(),
    finishLetter: vi.fn(),
}));
vi.mock('@logic/letters/LetterWriter.js', async (importOriginal) => ({ ...(await importOriginal()), ...letterSteps }));

const RECIPIENT = {
    id: 'skogsstyrelsen', name: 'Skogsstyrelsen', kind: 'institution', category: 'agency', organisation: null,
    email: 'registrator@example.org', language: 'sv', remit: 'forests', why: 'felling notices', topics: ['customtopic'],
    active: true, facts: [],
};
vi.mock('@logic/letters/recipients.js', async (importOriginal) => ({
    ...(await importOriginal()),
    loadRecipients: vi.fn(async () => [RECIPIENT]),
    loadTopicIds: vi.fn(async () => ['customtopic']),
}));
vi.mock('@logic/letters/history.js', () => ({
    loadLetterHistory: vi.fn(async () => ({ recentAuthors: [], recentForms: [], recentAsks: [], exclude: new Set() })),
}));

const fill = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, type: 'message', speaker: 's', text: `m${i}` }));
const types = (manager) => manager.meeting.conversation.map((m) => m.type);
const tail = (manager) => manager.meeting.conversation.at(-1);

function letterManager({ sendsLetters = true, printsLetters = false } = {}) {
    const { manager } = createTestManager('test');
    manager.serverOptions.meetingEnding = 'letter';
    manager.serverOptions.conversationMaxLength = 3;
    manager.serverOptions.meetingVeryMaxLength = 3; // no room to extend → the loop concludes
    manager.meeting.conversationExtraSlots = 0;
    manager.meeting.sendsLetters = sendsLetters;
    manager.meeting.printsLetters = printsLetters;
    manager.meeting.topic = { ...manager.meeting.topic, id: 'customtopic' };
    manager.meeting.conversation = fill(3);
    const author = manager.meeting.characters[1];

    let chairLines = 0;
    const chair = vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockImplementation(async () => ({
        response: 'This concludes the meeting. But before we go, I think the author wants to send an email.',
        id: `chair${++chairLines}`, sentences: ['Closing.'], trimmed: false, pretrimmed: false,
    }));
    const protocol = vi.spyOn(manager.dialogGenerator, 'generateDocument');
    vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
    vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
    const audio = vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);

    letterSteps.pickAuthor.mockResolvedValue({ authorId: author.id, reason: 'it has most to lose', ranking: [], restingAuthors: [], fallback: false, prompt: '', raw: '' });
    letterSteps.planLetter.mockResolvedValue({
        recipientId: RECIPIENT.id, points: ['review the notices first'], spokenText: 'I will write to Skogsstyrelsen. Frank, would you like to add something?',
        prompt: '', raw: '', attempts: 1,
    });
    letterSteps.draftLetter.mockImplementation(async (_ctx, input) => ({
        form: input.form, asksReply: input.asksReply, authorId: input.authorId, recipientId: input.recipient.id,
        subject: 'Three weeks', body: 'Dear Skogsstyrelsen, …', prompt: '', raw: '',
    }));
    letterSteps.sortHumanAddition.mockImplementation(async (_ctx, text) => ({ text, handling: 'weave', reason: '', raw: '' }));
    letterSteps.finishLetter.mockImplementation(async (_ctx, draft, _recipient, human) => ({
        ...draft, body: `${draft.body} (with ${human.text || 'nothing'})`, humanNote: null, footer: 'Footer',
        human, humanContributed: human.handling === 'weave', weave: null,
    }));
    return { manager, author, chair, protocol, audio };
}

const spokenBy = (audio, messageId) => audio.mock.calls.find(([message]) => message.id === messageId)?.[1]?.id;

describe('letter ending', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes with a hand-over to the author and the letter_pending marker, saving the author in the same write', async () => {
        const { manager, author } = letterManager();
        const writes = manager.services.meetingsCollection.updateOne;

        await manager.meetingLifecycleHandler.handleConcludeMeeting({ date: '2026-10-10' });

        expect(types(manager)).toEqual(['message', 'message', 'message', 'message', 'letter_pending']);
        expect(writes).toHaveBeenCalledWith(
            { _id: manager.meeting._id },
            { $set: { conversation: manager.meeting.conversation, letter: { authorId: author.id } } },
        );
    });

    it('runs from the closing line to the author announcing the letter, then waits for the human', async () => {
        const { manager, author, audio } = letterManager();

        await manager.runLoop();

        const announcement = manager.meeting.conversation.at(-2);
        expect(announcement).toMatchObject({ type: 'message', speaker: author.id });
        expect(tail(manager)).toMatchObject({ type: 'awaiting_letter_addition', speaker: 'Frank' });
        expect(manager.decideNextAction().type).toBe('IDLE');
        expect(spokenBy(audio, announcement.id)).toBe(author.id);
        expect(manager.meeting.letter).toMatchObject({ authorId: author.id, recipientId: RECIPIENT.id, points: ['review the notices first'] });
    });

    it.each([
        ['the human answers on an installation: printed and sent', 'submit', true, { present: true, send: true }],
        ['the human answers on the web: printed, not sent', 'submit', false, { present: true, send: false }],
        ['the human walks away: neither printed nor sent', 'skip', true, { present: false, send: false }],
    ])('%s', async (_label, answer, sendsLetters, expected) => {
        const { manager, author, audio, protocol } = letterManager({ sendsLetters });
        await manager.runLoop();

        if (answer === 'submit') {
            await manager.humanInputHandler.handleSubmitHumanMessage({ text: 'Please listen to us.' });
        } else {
            await manager.humanInputHandler.handleSkipHumanTurn();
        }
        await vi.waitFor(() => expect(tail(manager).type).toBe('summary'));

        const summary = tail(manager);
        expect(summary.speaker).toBe(author.id);
        expect(summary.letter).toMatchObject({ authorId: author.id, recipientName: RECIPIENT.name, ...expected });
        expect(spokenBy(audio, summary.id)).toBe(author.id); // read by its author, not the chair
        expect(protocol).not.toHaveBeenCalled();
        expect(manager.meeting.letter).toMatchObject({ finishedAt: expect.any(String), ...expected });
    });

    it('keeps the human\'s words in the conversation, read by the chair for replay, written with the marker', async () => {
        const { manager } = letterManager();
        await manager.runLoop();
        const before = types(manager).slice(0, -1);
        const writes = manager.services.meetingsCollection.updateOne;
        writes.mockClear();

        await manager.humanInputHandler.handleSubmitHumanMessage({ text: 'Please listen to us.' });

        expect(types(manager)).toEqual([...before, 'human', 'summary_pending']);
        const said = manager.meeting.conversation.at(-2);
        expect(said).toMatchObject({ speaker: 'Frank', text: expect.stringContaining('Please listen to us.') });
        expect(writes.mock.calls[0][1].$set.conversation.map((m) => m.type)).toEqual([...before, 'human', 'summary_pending']);
        await vi.waitFor(() => expect(tail(manager).type).toBe('summary'));
        expect(types(manager)).toEqual([...before, 'human', 'summary']);
        expect(spokenBy(manager.audioSystem.generateAudio, said.id)).toBe(manager.meeting.characters[0].id);
        expect(letterSteps.sortHumanAddition).toHaveBeenCalledWith(expect.anything(), 'Please listen to us.');
    });

    it('leaves nothing of the human in the conversation or the letter when they walked away', async () => {
        const { manager } = letterManager();
        await manager.runLoop();
        const before = types(manager).slice(0, -1);
        await manager.humanInputHandler.handleSkipHumanTurn();
        await vi.waitFor(() => expect(tail(manager).type).toBe('summary'));

        expect(types(manager)).toEqual([...before, 'summary']);
        expect(letterSteps.sortHumanAddition).not.toHaveBeenCalled();
        expect(letterSteps.finishLetter.mock.calls[0][3]).toMatchObject({ text: '', handling: 'none' });
    });

    it.each([
        ['printing on, the human answers: farewell, credits, then the letter, sent', true, 'submit', ['human', 'letter_farewell', 'credits', 'summary'], { present: true, send: true }],
        ['printing on, the human walks away: farewell, credits, then the letter, unsent', true, 'skip', ['letter_farewell', 'credits', 'summary'], { present: false, send: false }],
        ['printing off: the letter alone, read by its author', false, 'submit', ['human', 'summary'], { present: true, send: true }],
    ])('%s', async (_label, printsLetters, answer, ending, expected) => {
        const { manager, author, audio } = letterManager({ printsLetters });
        await manager.runLoop();
        const before = types(manager).slice(0, -1);

        if (answer === 'submit') {
            await manager.humanInputHandler.handleSubmitHumanMessage({ text: 'Please listen to us.' });
        } else {
            await manager.humanInputHandler.handleSkipHumanTurn();
        }
        await vi.waitFor(() => expect(tail(manager).type).toBe('summary'));

        expect(types(manager)).toEqual([...before, ...ending]);
        expect(tail(manager).letter).toMatchObject(expected);
        expect(spokenBy(audio, tail(manager).id)).toBe(author.id); // recorded for replay either way
        expect(manager.meeting.maximumPlayedIndex).toBe(manager.meeting.conversation.length - 1);
        const farewell = manager.meeting.conversation.find((m) => m.type === 'letter_farewell');
        if (farewell) expect(spokenBy(audio, farewell.id)).toBe(manager.meeting.characters[0].id);
    });

    it('writes the letter while the human thinks: the answer does not wait for a draft', async () => {
        const { manager } = letterManager();
        await manager.runLoop();
        expect(letterSteps.draftLetter).toHaveBeenCalledTimes(1); // started by the announcement

        await manager.humanInputHandler.handleSubmitHumanMessage({ text: 'Please listen to us.' });
        await vi.waitFor(() => expect(tail(manager).type).toBe('summary'));

        expect(letterSteps.draftLetter).toHaveBeenCalledTimes(1);
    });

    it('plans again at the announcement when the plan started with the closing line failed', async () => {
        const { manager } = letterManager();
        letterSteps.planLetter.mockRejectedValueOnce(new Error('unusable plan'));

        await manager.runLoop();

        expect(letterSteps.planLetter).toHaveBeenCalledTimes(2);
        expect(tail(manager).type).toBe('awaiting_letter_addition');
    });

    it('recovers a reconnect at letter_pending: the saved author announces, with no second closing line', async () => {
        const { manager, author, chair } = letterManager();
        manager.meeting.conversation = [...fill(3), { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' }, { type: 'letter_pending' }];
        manager.meeting.letter = { authorId: author.id };

        await manager.runLoop();

        expect(chair).not.toHaveBeenCalled();
        expect(letterSteps.pickAuthor).not.toHaveBeenCalled();
        expect(manager.meeting.conversation.at(-2)).toMatchObject({ type: 'message', speaker: author.id });
        expect(tail(manager).type).toBe('awaiting_letter_addition');
    });

    it('recovers a reconnect after the human answered: the saved draft is finished, not written again', async () => {
        const { manager, author } = letterManager();
        manager.meeting.conversation = [
            ...fill(3),
            { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
            { id: 'a1', type: 'message', speaker: author.id, text: 'I will write.' },
            { type: 'summary_pending' },
        ];
        manager.meeting.letter = {
            authorId: author.id, recipientId: RECIPIENT.id, points: ['ask'], form: 'note', asksReply: false,
            draft: { subject: 'Saved', body: 'Saved draft' }, present: true, addition: 'hello',
        };

        await manager.runLoop();

        expect(letterSteps.draftLetter).not.toHaveBeenCalled();
        expect(tail(manager)).toMatchObject({ type: 'summary', speaker: author.id, letter: { subject: 'Saved', present: true } });
    });

    it.each([
        ['letter_pending', 'ANNOUNCE_LETTER'],
        ['summary_pending', 'GENERATE_SUMMARY'],
    ])('resolves a trailing %s even with a stale raised hand or pause', (marker, action) => {
        const { manager } = letterManager();
        manager.meeting.conversation = [...fill(2), { type: marker }];
        manager.handRaised = true;
        manager.isPaused = true;

        expect(manager.decideNextAction().type).toBe(action);
    });

    it.each(['letter_pending', 'awaiting_letter_addition'])('rejects a raised hand once the tail is %s', async (marker) => {
        const { manager } = letterManager();
        manager.meeting.conversation = [...fill(2), { type: marker, ...(marker === 'awaiting_letter_addition' ? { speaker: 'Frank', text: '' } : {}) }];
        const before = [...manager.meeting.conversation];

        await manager.handRaisingHandler.handleRaiseHand({ index: 1, humanName: 'Frank' });

        expect(manager.handRaised).toBe(false);
        expect(manager.meeting.conversation).toEqual(before);
    });

    it.each(['letter_pending', 'awaiting_letter_addition'])('resume keeps a trailing %s; replay drops it', (marker) => {
        const meeting = MockFactory.createStoredMeeting({
            _id: 951,
            conversation: [
                { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
                { type: marker, ...(marker === 'awaiting_letter_addition' ? { speaker: 'Frank', text: '' } : {}) },
            ],
            audio: ['m0', 'close1'],
            maximumPlayedIndex: 2,
        });

        expect(buildResumeConversation(structuredClone(meeting)).at(-1).type).toBe(marker);
        expect(buildReplayMeetingManifest(structuredClone(meeting)).conversation.at(-1).type).toBe('meeting_incomplete');
    });

    it('replay drops the farewell and credits and goes from the human\'s words to the letter; resume keeps them', () => {
        const meeting = MockFactory.createStoredMeeting({
            _id: 952,
            conversation: [
                { id: 'a1', type: 'message', speaker: 'water', text: 'I will write. Would you like to add something?' },
                { id: 'h1', type: 'human', speaker: 'Frank', text: 'Frank said: listen' },
                { id: 'f1', type: 'letter_farewell', speaker: 'chair', text: 'Thank you. It is printed behind you.' },
                { type: 'credits' },
                { id: 'l1', type: 'summary', speaker: 'water', text: 'Dear …' },
            ],
            audio: ['a1', 'h1', 'f1', 'l1'],
            maximumPlayedIndex: 4,
        });

        const replay = buildReplayMeetingManifest(structuredClone(meeting));
        expect(replay.conversation.map((m) => m.type)).toEqual(['message', 'human', 'summary']);
        expect(replay.audio).toEqual(['a1', 'h1', 'l1']);
        expect(buildResumeConversation(structuredClone(meeting)).map((m) => m.type))
            .toEqual(['message', 'human', 'letter_farewell', 'credits', 'summary']);
    });
});
