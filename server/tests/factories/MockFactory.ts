import { v4 as uuidv4 } from "uuid";
import type { Character, Message, Topic, Audio, Meeting } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";

export const MockFactory = {
    createCharacter: (overrides: Partial<Character> = {}): Character => ({
        id: "potato",
        name: "Potato",
        voice: "alloy",
        type: "food",
        ...overrides,
    }),

    createMessage: (overrides: Partial<Message> = {}): Message => ({
        id: uuidv4(),
        speaker: "potato",
        text: "Hello, I am a potato.",
        type: "message",
        ...overrides,
    }),

    createConversation: (length: number, speakers: string[] = ["potato", "tomato"]): Message[] => {
        return Array.from({ length }, (_, i) => MockFactory.createMessage({
            text: `Message ${i}`,
            speaker: speakers[i % speakers.length],
        }));
    },

    createTopic: (overrides: Partial<Topic> = {}): Topic => ({
        id: "pizza",
        title: "Pizza Council",
        description: "Discussion about pizza",
        prompt: "The deliciousness of pizza",
        ...overrides,
    }),

    /** Session / global options — not persisted on StoredMeeting. */
    createServerOptions: (overrides: Partial<GlobalOptions> = {}): GlobalOptions =>
        ({
            gptModel: "gpt-4o",
            voiceModel: "tts-1",
            geminiVoiceModel: "gemini-2.5-flash-tts",
            inworldVoiceModel: "inworld-tts-1",
            temperature: 0.7,
            maxTokens: 100,
            chairMaxTokens: 150,
            frequencyPenalty: 0.0,
            presencePenalty: 0.0,
            audio_speed: 1.0,
            trimSentance: true,
            trimParagraph: true,
            chairId: "water",
            trimChairSemicolon: true,
            show_trimmed: false,
            skipAudio: false,
            conversationMaxLength: 20,
            raiseHandPrompt: { en: "Raise Hand" },
            raiseHandInvitationLength: 50,
            finalizeMeetingPrompt: { en: "Finalize" },
            finalizeMeetingLength: 5,
            extraMessageCount: 2,
            transcribeModel: "whisper-1",
            transcribePrompt: { en: "Transcribe" },
            audioConcurrency: 2,
            ...overrides,
        }) as GlobalOptions,

    /** Persisted meeting document (no serverOptions in DB). */
    createStoredMeeting: (overrides: Partial<StoredMeeting> = {}): StoredMeeting => {
        const topic = overrides.topic ?? MockFactory.createTopic();
        const { serverOptions: _omit, ...restOverrides } = overrides as Partial<StoredMeeting> & {
            serverOptions?: unknown;
        };
        const defaults: StoredMeeting = {
            _id: 123,
            creatorKey: "test-creator-key",
            date: new Date().toISOString(),
            topic,
            characters: [
                MockFactory.createCharacter({ id: "water", name: "Water" }),
                MockFactory.createCharacter({ id: "tomato", name: "Tomato" }),
                MockFactory.createCharacter({ id: "potato", name: "Potato" }),
            ],
            language: "en",
            state: { alreadyInvited: false, humanName: "Frank" },
            conversation: [],
            audio: [],
        };
        return { ...defaults, ...restOverrides, topic };
    },

    createMeeting: (overrides: Partial<Meeting> = {}): Meeting => {
        const storedMeeting = MockFactory.createStoredMeeting();
        const { creatorKey, ...meeting } = storedMeeting;
        return { ...meeting, ...overrides };
    },

    createAudio: (overrides: Partial<Audio> = {}): Audio => ({
        _id: uuidv4(),
        meeting_id: 123,
        date: new Date().toISOString(),
        audio: Buffer.from([]),
        sentences: [],
        ...overrides,
    } as unknown as Audio),
};
