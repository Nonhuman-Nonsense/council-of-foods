
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        const conversation = [];
        const options = manager.conversationOptions;
        // Mock a specific topic
        options.topic = "The deliciousness of pizza";
        speaker.prompt = "You are a red tomato.";

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, options);

        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toContain(options.topic);
        expect(messages[0].content).toContain(speaker.prompt);
    });

    it('should correctly format conversation history', () => {
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        const conversation = [
            { speaker: 'water', text: 'Hello', type: 'message' }, // Water (Chair)
            { speaker: 'tomato', text: 'Hi there', type: 'message' } // Tomato (Self)
        ];
        const options = manager.conversationOptions;

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, options);

        // System prompt + 2 messages + 1 partial assistant prompt
        expect(messages).toHaveLength(4);

        // Message 1 (Water)
        expect(messages[1].role).toBe("user");
        expect(messages[1].content).toContain("Water: Hello");

        // Message 2 (Tomato/Self)
        expect(messages[2].role).toBe("assistant");
        expect(messages[2].content).toContain("Tomato: Hi there");

        // Final message (Prompt for completion)
        expect(messages[3].role).toBe("system");
        expect(messages[3].content).toBe("Tomato: ");
    });

    it('should correctly format a Human Panelist in history', () => {
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        const conversation = [
            { speaker: 'alice', text: 'I agree', type: 'message' }
        ];

        // Add human panelist "Alice"
        manager.conversationOptions.characters.push({
            id: 'alice',
            name: 'Alice',
            type: 'panelist'
        });

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.conversationOptions);

        expect(messages[1].content).toContain("Alice: I agree");
    });

    it('should correctly format a Human Input (Question) in history', () => {
        const speaker = manager.conversationOptions.characters[0]; // Chair
        manager.conversationOptions.state.humanName = "Frank";

        const conversation = [
            { speaker: 'Frank', text: 'What about sauce?', type: 'human' }
        ];

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.conversationOptions);

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
        await dialogGenerator.chairInterjection(
            interjection,
            0,
            100,
            false,
            [],
            manager.conversationOptions,
            null
        );

        const callArgs = mockCreate.mock.calls[0][0];
        const sentMessages = callArgs.messages;
        const lastMessage = sentMessages[sentMessages.length - 1];

        expect(lastMessage.role).toBe("system");
        expect(lastMessage.content).toBe(interjection);
    });
});
