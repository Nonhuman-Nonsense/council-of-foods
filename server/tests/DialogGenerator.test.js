import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DialogGenerator } from '@logic/DialogGenerator.js';
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
            MockFactory.createMessage({ speaker: 'water', text: 'Hello' }), // Water (Chair)
            MockFactory.createMessage({ speaker: 'tomato', text: 'Hi there' }) // Tomato (Self)
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
            MockFactory.createMessage({ speaker: 'alice', text: 'I agree' })
        ];

        // Add human panelist "Alice"
        manager.conversationOptions.characters.push(
            MockFactory.createCharacter({
                id: 'alice',
                name: 'Alice',
                type: 'panelist'
            })
        );

        const messages = dialogGenerator.buildMessageStack(speaker, conversation, manager.conversationOptions);

        expect(messages[1].content).toContain("Alice: I agree");
    });

    it('should correctly format a Human Input (Question) in history', () => {
        const speaker = manager.conversationOptions.characters[0]; // Chair
        manager.conversationOptions.state.humanName = "Frank";

        const conversation = [
            MockFactory.createMessage({ speaker: 'Frank', text: 'What about sauce?', type: 'human' })
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


describe('DialogGenerator - Text Cleaning & Post-Processing', () => {
    let manager;
    let dialogGenerator;

    // Helper to mock OpenAI response
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
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        mockGPTResponse("Tomato: Hello world");

        const result = await dialogGenerator.generateTextFromGPT(
            speaker, [], manager.conversationOptions, 1
        );

        expect(result.response).toBe("Hello world");
        expect(result.pretrimmed).toBe("Tomato:");
    });

    it('should remove markdown bold speaker name prefix', async () => {
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        mockGPTResponse("**Tomato**: Hello bold world");

        const result = await dialogGenerator.generateTextFromGPT(
            speaker, [], manager.conversationOptions, 1
        );

        expect(result.response).toBe("Hello bold world");
    });

    it('should trim trailing text after periods if trimSentance is enabled', async () => {
        const speaker = manager.conversationOptions.characters[1];
        manager.conversationOptions.options.trimSentance = true;
        // finish_reason must be NOT stop (e.g., length) for trimming to activate in some logics, 
        // OR the logic runs if it IS stop? 
        // Checking code: if (completion.choices[0].finish_reason != "stop") { ... trimming ... }
        // So we must simulate run-on (length/content_filter) or just 'length'

        mockGPTResponse("Hello world. This is extra", "length");

        const result = await dialogGenerator.generateTextFromGPT(
            speaker, [], manager.conversationOptions, 1
        );

        expect(result.response).toBe("Hello world.");
        expect(result.trimmed).toBe(" This is extra");
    });

    it('should trim after double newline if trimParagraph is enabled', async () => {
        const speaker = manager.conversationOptions.characters[1];
        manager.conversationOptions.options.trimParagraph = true;

        mockGPTResponse("First paragraph.\n\nSecond paragraph.", "length");

        const result = await dialogGenerator.generateTextFromGPT(
            speaker, [], manager.conversationOptions, 1
        );

        expect(result.response).toBe("First paragraph.");
        expect(result.trimmed).toBe("\n\nSecond paragraph.");
    });

    it('should cut off text if another character starts speaking', async () => {
        const speaker = manager.conversationOptions.characters[1]; // Tomato
        const otherChar = manager.conversationOptions.characters[0]; // Water (Chair)

        // "Water" is the name of character[0]
        mockGPTResponse("I am talking. Water: Hey stop!");

        const result = await dialogGenerator.generateTextFromGPT(
            speaker, [], manager.conversationOptions, 1
        );

        expect(result.response).toBe("I am talking.");
        expect(result.trimmed).toBe("Water: Hey stop!");
    });

    it('should handle complex Chair List logic (Semicolon trimming)', async () => {
        const chair = manager.conversationOptions.characters[0];
        manager.conversationOptions.options.chairId = chair.id; // ensure ID matches
        manager.conversationOptions.options.trimChairSemicolon = true;

        // Output mimics a list cutoff: "1. Topic\n2. Topic" where 3 is cut or partial
        // Logic requires specific structure: 
        // trimmedContent needs to exist, meaning finish_reason != stop AND split happened.
        // OR splitSentences logic.

        // Let's try to trigger the specific path:
        // finish_reason != 'stop'
        // trimSentance to create 'trimmedContent'
        manager.conversationOptions.options.trimSentance = true;

        // "1. First item.\n2. Second item. 3. Thi" -> cut at last period
        mockGPTResponse("1. First.\n2. Second. 3. Thi", "length");

        const result = await dialogGenerator.generateTextFromGPT(
            chair, [], manager.conversationOptions, 0
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
});
