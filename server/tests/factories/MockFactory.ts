import { v4 as uuidv4 } from "uuid";
import type { Character, ConversationMessage } from "@shared/ModelTypes.js";
import type { Meeting, Audio } from "@models/DBModels.js";
import type { ConversationOptions } from "@interfaces/MeetingInterfaces.js";

export const MockFactory = {
    createCharacter: (overrides: Partial<Character> = {}): Character => ({
        id: "potato",
        name: "Potato",
        voice: "alloy",
        type: "food",
        ...overrides,
    }),

    createMessage: (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
        id: uuidv4(),
        speaker: "potato",
        text: "Hello, I am a potato.",
        type: "message",
        ...overrides,
    }),

    createConversation: (length: number, speakers: string[] = ["potato", "tomato"]): ConversationMessage[] => {
        return Array.from({ length }, (_, i) => MockFactory.createMessage({
            text: `Message ${i}`,
            speaker: speakers[i % speakers.length],
        }));
    },

    createMeeting: (overrides: Partial<Meeting> = {}): Meeting => ({
        _id: 123,
        date: new Date().toISOString(),
        conversation: [],
        audio: [],
        options: MockFactory.createConversationOptions({}),
        ...overrides,
    } as Meeting),

    createAudio: (overrides: Partial<Audio> = {}): Audio => ({
        _id: uuidv4(),
        meeting_id: 123,
        date: new Date().toISOString(),
        // index: 0, // Audio interface doesn't strictly have index in DBModels? Checked: No, it has _id, date, meeting_id, audio, sentences.
        audio: Buffer.from([]),
        sentences: [],
        ...overrides,
    } as unknown as Audio),

    createConversationOptions: (overrides: Partial<ConversationOptions> = {}): ConversationOptions => {
        const defaults: ConversationOptions = {
            characters: [
                MockFactory.createCharacter({ id: 'water', name: 'Water' }),
                MockFactory.createCharacter({ id: 'potato', name: 'Potato' })
            ],
            language: 'en',
            topic: 'General Council',
            options: {
                // GlobalOptions fields
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
                audioConcurrency: 2
            },
            state: {
                alreadyInvited: false
            }
        };
        return { ...defaults, ...overrides };
    }
};
