import { v4 as uuidv4 } from "uuid";
import type { Character, Message, Topic, Audio, Meeting } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { CHAIR_ID, defaultCharacterSetupBundle } from "@logic/characterSetupBundle.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";

function cloneCharacter(character: Character): Character {
    return {
        ...character,
    };
}

export const DEFAULT_TEST_CHARACTERS: Character[] = defaultCharacterSetupBundle.characters
    .slice(0, 3)
    .map((character) => cloneCharacter(character as Character));

export const DEFAULT_TEST_CHAIR = cloneCharacter(DEFAULT_TEST_CHARACTERS[0]);
export const DEFAULT_TEST_SPEAKER_1 = cloneCharacter(DEFAULT_TEST_CHARACTERS[1] ?? DEFAULT_TEST_CHAIR);
export const DEFAULT_TEST_SPEAKER_2 = cloneCharacter(DEFAULT_TEST_CHARACTERS[2] ?? DEFAULT_TEST_SPEAKER_1);

export const MockFactory = {
    createCharacter: (overrides: Partial<Character> = {}): Character => ({
        id: "speaker1",
        name: "Speaker 1",
        description: "A generic participant used for tests where identity is irrelevant.",
        prompt: "Speak as Speaker 1 in the council.",
        voice: "alloy",
        ...overrides,
    }),

    createChair: (overrides: Partial<Character> = {}): Character =>
        MockFactory.createCharacter({
            ...DEFAULT_TEST_CHAIR,
            id: CHAIR_ID,
            ...overrides,
        }),

    createPanelist: (indexOrId: number | string = 0, overrides: Partial<Character> = {}): Character => {
        const id = typeof indexOrId === "number" ? `panelist${indexOrId}` : indexOrId;
        return MockFactory.createCharacter({
            id,
            name: "",
            description: "",
            prompt: "",
            voice: "alloy",
            ...overrides,
        });
    },

    createCharacters: (...overridesList: Array<Partial<Character>>): Character[] =>
        overridesList.map((overrides) => MockFactory.createCharacter(overrides)),

    createMessage: (overrides: Partial<Message> = {}): Message =>
        ({
            id: uuidv4(),
            speaker: "speaker1",
            text: "Hello from speaker1.",
            type: "message",
            ...overrides,
        }) as Message,

    createConversation: (length: number, speakers: string[] = ["speaker1", "speaker2"]): Message[] => {
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

    createCreateMeetingBody: (
        overrides: Partial<{
            topic: Topic;
            characters: Character[];
            language: string;
        }> = {},
    ) => ({
        topic: MockFactory.createTopic(),
        characters: [MockFactory.createCharacter()],
        language: "en",
        ...overrides,
    }),

    /** Session / global options — not persisted on StoredMeeting. */
    createServerOptions: (overrides: Partial<GlobalOptions> = {}): GlobalOptions =>
        ({
            conversationModel: "mistral/mistral-small-3-2",
            conversationReasoning: "none",
            voiceModel: "gpt-4o-mini-tts",
            inworldVoiceModel: "inworld-tts-1.5-mini",
            elevenlabsVoiceModel: "eleven_flash_v2_5",
            temperature: 1,
            maxTokens: 100,
            chairMaxTokens: 50,
            defaultAudioSpeed: 1.25,
            subtitleTimingPriorities: ["elevenlabs", "inworld", "estimated", "whisper"],
            trimSentance: false,
            trimParagraph: true,
            chairId: CHAIR_ID,
            trimChairSemicolon: true,
            show_trimmed: false,
            skipAudio: false,
            conversationMaxLength: 20,
            meetingVeryMaxLength: 30,
            raiseHandPrompt: { en: "Raise Hand" },
            raiseHandInvitationLength: 50,
            panelistInvitationPrompt: { en: "Welcome [NAME]" },
            panelistInvitationLength: 50,
            concludeMeetingPrompt: { en: "Closing line" },
            concludeMeetingLength: 50,
            summarizeMeetingPrompt: { en: "Summarize" },
            summarizeMeetingLength: 5,
            extraMessageCount: 2,
            transcribeModel: "whisper-1",
            transcribePrompt: { en: "Transcribe" },
            audioConcurrency: 2,
            chairRealtime: {
                strategy: "unified",
                languages: {
                    en: {
                        provider: "inworld",
                        llmModel: "google-ai-studio/gemini-2.5-flash",
                        ttsModel: "inworld-tts-1.5-max",
                        transcriptionModel: "test/stt-chair",
                        agentVoice: null,
                    },
                    sv: {
                        provider: "inworld",
                        llmModel: "google-ai-studio/gemini-2.5-flash",
                        ttsModel: "inworld-tts-2",
                        transcriptionModel: "test/stt-chair",
                        agentVoice: null,
                    },
                },
            },
            humanInputRealtime: {
                languages: {
                    en: {
                        provider: "inworld",
                        llmModel: "google-ai-studio/gemini-2.5-flash",
                        transcriptionModel: "test/stt-human-input",
                    },
                    sv: {
                        provider: "inworld",
                        llmModel: "google-ai-studio/gemini-2.5-flash",
                        transcriptionModel: "test/stt-human-input",
                    },
                },
            },
            speakerClassifierModel: "google-ai-studio/gemini-2.5-flash",
            directedSpeakerRouting: false,
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
            liveKey: "test-live-key",
            date: new Date().toISOString(),
            topic,
            characters: MockFactory.createCharacters(
                ...DEFAULT_TEST_CHARACTERS,
            ),
            language: "en",
            state: { alreadyInvited: false, humanName: "Frank" },
            conversation: [],
            audio: [],
            conversationExtraSlots: 0,
            meetingComplete: false,
        };
        return { ...defaults, ...restOverrides, topic };
    },

    createMeeting: (overrides: Partial<Meeting> = {}): Meeting => {
        const storedMeeting = MockFactory.createStoredMeeting();
        const { liveKey: _liveKey, ...meeting } = storedMeeting;
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
