import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockFactory } from './factories/MockFactory.ts';
import { createTestManager } from './commonSetup.js';

describe('DialogGenerator - Prompt Construction', () => {
    let manager;
    let dialogGenerator;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        dialogGenerator = manager.dialogGenerator;
    });

    it('should build a message stack with the correct system prompt', () => {
        const speaker = manager.meeting.characters[1]; // Tomato
        const conversation = [];
        manager.meeting.topic = MockFactory.createTopic({
            prompt: 'The deliciousness of pizza',
            title: manager.meeting.topic.title,
            description: manager.meeting.topic.description,
            id: manager.meeting.topic.id
        });
        speaker.prompt = "You are a red tomato.";

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.meeting);

        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toContain('The deliciousness of pizza');
        expect(messages[0].content).toContain(speaker.prompt);
    });

    it('should correctly format conversation history', () => {
        const chair = manager.meeting.characters[0];
        const speaker = manager.meeting.characters[1];
        const conversation = [
            MockFactory.createMessage({ speaker: chair.id, text: 'Hello' }),
            MockFactory.createMessage({ speaker: speaker.id, text: 'Hi there' })
        ];

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.meeting);

        // System prompt + 2 messages + 1 partial assistant prompt
        expect(messages).toHaveLength(4);

        // Message 1 (Water)
        expect(messages[1].role).toBe("user");
        expect(messages[1].content).toContain(`${chair.name}: Hello`);

        // Message 2 (Tomato/Self)
        expect(messages[2].role).toBe("assistant");
        expect(messages[2].content).toContain(`${speaker.name}: Hi there`);

        // Final message (Prompt for completion)
        expect(messages[3].role).toBe("system");
        expect(messages[3].content).toBe(`${speaker.name}: `);
    });

    it('should correctly format a Human Panelist in history', () => {
        const speaker = manager.meeting.characters[1]; // Tomato
        const conversation = [
            MockFactory.createMessage({ speaker: 'panelist0', text: 'I agree' })
        ];

        manager.meeting.characters.push(
            MockFactory.createCharacter({
                id: 'panelist0',
                name: 'Alice',
            })
        );

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.meeting);

        expect(messages[1].content).toContain("Alice: I agree");
    });

    it('should correctly format a Human Input (Question) in history', () => {
        const speaker = manager.meeting.characters[0]; // Chair
        manager.meeting.state = { ...manager.meeting.state, humanName: "Frank" };

        const conversation = [
            MockFactory.createMessage({ speaker: 'Frank', text: 'What about sauce?', type: 'human' })
        ];

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.meeting);

        expect(messages[1].content).toContain("Frank: What about sauce?");
    });

    it('should handle chair interjection prompts', async () => {
        // Mock OpenAI call within this specific test if needed, or rely on global mock
        // ensuring we can capture the "messages" sent to it.
        const mockCreate = vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Chair: Hello human!' } }]
        });

        // Spy on getOpenAI to return our local spy
        vi.spyOn(manager.services, 'getOpenAI').mockReturnValue({
            chat: { completions: { create: mockCreate } }
        });

        const interjection = "Invite the human to speak.";
        const mockBroadcaster = {
            broadcastConversationUpdate: vi.fn(),
            broadcastConversationEnd: vi.fn(),
            broadcastAudioUpdate: vi.fn(),
            broadcastError: vi.fn(),
            broadcastWarning: vi.fn()
        };

        await dialogGenerator.chairInterjection(
            interjection,
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        const callArgs = mockCreate.mock.calls[0][0];
        const sentMessages = callArgs.messages;
        const lastMessage = sentMessages[sentMessages.length - 1];
        const interjectionMessage = sentMessages[sentMessages.length - 2];

        expect(interjectionMessage.role).toBe("system");
        expect(interjectionMessage.content).toBe(interjection);
        expect(lastMessage.role).toBe("system");
        expect(lastMessage.content).toBe(`${manager.meeting.characters[0].name}: `);
    });
});


describe('DialogGenerator - Text Cleaning & Post-Processing', () => {
    let manager;
    let dialogGenerator;

    const mockGPTResponse = (content, finish_reason = "stop") => {
        const mockCreate = vi.fn().mockResolvedValue({
            id: 'mock-id',
            choices: [{
                message: { content },
                finish_reason
            }]
        });
        vi.spyOn(manager.services, 'getOpenAI').mockReturnValue({
            chat: { completions: { create: mockCreate } }
        });
    };

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        dialogGenerator = manager.dialogGenerator;
    });

    it('should remove speaker name prefix from response', async () => {
        const speaker = manager.meeting.characters[1];
        mockGPTResponse(`${speaker.name}: Hello world`);

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe("Hello world");
        expect(result.pretrimmed).toBe(`${speaker.name}:`);
    });

    it('should remove markdown bold speaker name prefix', async () => {
        const speaker = manager.meeting.characters[1];
        mockGPTResponse(`**${speaker.name}**: Hello bold world`);

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe("Hello bold world");
    });

    it('should trim trailing text after periods if trimSentance is enabled', async () => {
        const speaker = manager.meeting.characters[1];
        manager.serverOptions.trimSentance = true;

        mockGPTResponse("Hello world. This is extra", "length");

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe("Hello world.");
        expect(result.trimmed).toBe(" This is extra");
    });

    it('should trim after double newline if trimParagraph is enabled', async () => {
        const speaker = manager.meeting.characters[1];
        manager.serverOptions.trimParagraph = true;

        mockGPTResponse("First paragraph.\n\nSecond paragraph.", "length");

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe("First paragraph.");
        expect(result.trimmed).toBe("\n\nSecond paragraph.");
    });

    it('should cut off text if another character starts speaking', async () => {
        const chair = manager.meeting.characters[0];
        const speaker = manager.meeting.characters[1];

        mockGPTResponse(`I am talking. ${chair.name}: Hey stop!`);

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe("I am talking.");
        expect(result.trimmed).toBe(`${chair.name}: Hey stop!`);
    });

    it('should handle complex Chair List logic (Semicolon trimming)', async () => {
        const chair = manager.meeting.characters[0];
        manager.serverOptions.chairId = chair.id;
        manager.serverOptions.trimChairSemicolon = true;
        manager.serverOptions.trimSentance = true;

        mockGPTResponse("1. First.\n2. Second. 3. Thi", "length");

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            chair, m, 0
        );

        // Expectation: The logic attempts to reconstruct the list or handle the split.
        // Given "1. First.\n2. Second. 3. Thi", last period is after "Second."
        // trimmedContent = " 3. Thi"
        // sentences = ["1. First.", "2. Second."]
        // The specific 'trimChairSemicolon' logic checks for "1" and "2" start chars.

        // If logic works (lines 181+ in source), it should detect list format.
        // We expect it to likely KEEP "1. First." and "2. Second." 
        expect(result.response).toContain("1. First.");
        expect(result.response).toContain("2. Second.");
        expect(result.response).not.toContain("3. Thi");
    });

    it('should strip trailing conversation delimiter from normal turns', async () => {
        const speaker = manager.meeting.characters[1];
        mockGPTResponse('Hello council.\n\n---');

        const m = { ...manager.meeting, conversation: [] };
        const result = await dialogGenerator.generateTextFromGPT(
            speaker, m, 1
        );

        expect(result.response).toBe('Hello council.');
    });
});

describe('DialogGenerator - Chair Interjection Post-Processing', () => {
    let manager;
    let dialogGenerator;

    const mockChairInterjectionResponse = (content, finish_reason = "stop") => {
        const mockCreate = vi.fn().mockResolvedValue({
            id: 'interjection-id',
            choices: [{
                message: { content },
                finish_reason
            }]
        });
        vi.spyOn(manager.services, 'getOpenAI').mockReturnValue({
            chat: { completions: { create: mockCreate } }
        });
    };

    const mockBroadcaster = {
        broadcastConversationUpdate: vi.fn(),
        broadcastConversationEnd: vi.fn(),
        broadcastAudioUpdate: vi.fn(),
        broadcastError: vi.fn(),
        broadcastWarning: vi.fn()
    };

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        dialogGenerator = manager.dialogGenerator;
    });

    it('should remove chair name prefix and expose pretrimmed', async () => {
        const chair = manager.meeting.characters[0];
        mockChairInterjectionResponse(`${chair.name}: Welcome to the council.`);

        const result = await dialogGenerator.chairInterjection(
            'Invite the human.',
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        expect(result.response).toBe('Welcome to the council.');
        expect(result.pretrimmed).toBe(`${chair.name}:`);
    });

    it('should trim overflow sentences when trimSentance is enabled and finish reason is length', async () => {
        manager.serverOptions.trimSentance = true;
        mockChairInterjectionResponse('Thank you all. And one more thing', 'length');

        const result = await dialogGenerator.chairInterjection(
            'Close the meeting.',
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        expect(result.response).toBe('Thank you all.');
        expect(result.trimmed).toBe(' And one more thing');
    });

    it('should trim overflow paragraphs when trimParagraph is enabled and finish reason is length', async () => {
        manager.serverOptions.trimParagraph = true;
        mockChairInterjectionResponse('First paragraph.\n\nSecond paragraph.', 'length');

        const result = await dialogGenerator.chairInterjection(
            'Close the meeting.',
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        expect(result.response).toBe('First paragraph.');
        expect(result.trimmed).toBe('\n\nSecond paragraph.');
    });

    it('should keep full response when finish reason is stop even with trim flags enabled', async () => {
        manager.serverOptions.trimParagraph = true;
        manager.serverOptions.trimSentance = true;
        mockChairInterjectionResponse('First paragraph.\n\nSecond paragraph.', 'stop');

        const result = await dialogGenerator.chairInterjection(
            'Close the meeting.',
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        expect(result.response).toBe('First paragraph.\n\nSecond paragraph.');
        expect(result.trimmed).toBeUndefined();
    });

    it('should strip trailing conversation delimiter from chair interjection', async () => {
        mockChairInterjectionResponse('Visitor, what would you like to ask?\n\n---');

        const result = await dialogGenerator.chairInterjection(
            'Invite the human.',
            0,
            100,
            manager.meeting,
            mockBroadcaster
        );

        expect(result.response).toBe('Visitor, what would you like to ask?');
    });
});

describe('DialogGenerator - Document Generation', () => {
    let manager;
    let dialogGenerator;
    let mockCreate;

    const mockDocumentResponse = (content, finish_reason = 'stop') => {
        mockCreate = vi.fn().mockResolvedValue({
            id: 'document-id',
            choices: [{
                message: { content },
                finish_reason,
            }],
        });
        vi.spyOn(manager.services, 'getOpenAI').mockReturnValue({
            chat: { completions: { create: mockCreate } },
        });
    };

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        dialogGenerator = manager.dialogGenerator;
    });

    it('should preserve markdown horizontal rules and bold text', async () => {
        const content = 'PROTOKOLL\n\n---\n\n## Section\nBody with **bold**.';
        mockDocumentResponse(content);

        const result = await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        expect(result.response).toBe(content);
    });

    it('should strip markdown code fences from the model output', async () => {
        const inner = '# Protocol\n\n---\n\n## Section\nBody with **bold**.';
        mockDocumentResponse(`\`\`\`markdown\n${inner}\n\`\`\``);

        const result = await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        expect(result.response).toBe(inner);
    });

    it('should strip an unclosed markdown code fence opener', async () => {
        const inner = '# Protocol\n\nBody text.';
        mockDocumentResponse(`\`\`\`markdown\n${inner}`);

        const result = await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        expect(result.response).toBe(inner);
    });

    it('should trim overflow after the last sentence when finish reason is length', async () => {
        manager.serverOptions.trimSentance = true;
        mockDocumentResponse('First section complete.\n\n## More\nIncomplete tail', 'length');

        const result = await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        expect(result.response).toBe('First section complete.');
        expect(result.trimmed).toBe('\n\n## More\nIncomplete tail');
    });

    it('should keep full document when finish reason is stop even with trimSentance enabled', async () => {
        manager.serverOptions.trimSentance = true;
        const content = 'Done.\n\n## More\nStill included.';
        mockDocumentResponse(content, 'stop');

        const result = await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        expect(result.response).toBe(content);
        expect(result.trimmed).toBeUndefined();
    });

    it('should not send conversation stop or chair completion primer', async () => {
        mockDocumentResponse('## Summary\nDone.');

        await dialogGenerator.generateDocument(
            'Write the protocol.',
            manager.meeting,
            800,
        );

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.stop).toBeUndefined();

        const sentMessages = callArgs.messages;
        const lastMessage = sentMessages[sentMessages.length - 1];

        expect(lastMessage.role).toBe('system');
        expect(lastMessage.content).toBe('Write the protocol.');
        expect(sentMessages.some((message) => message.content === `${manager.meeting.characters[0].name}: `)).toBe(false);
    });
});
