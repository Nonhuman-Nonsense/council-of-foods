import { describe, it, expect } from "vitest";
import {
    getChairAgentVoice,
    getChairMeetingVoice,
    getChairRealtimeLanguageConfig,
    getHumanInputRealtimeLanguageConfig,
    normalizeSetupLanguage,
    validateChairRealtimeConfig,
    validateHumanInputRealtimeConfig,
    type ChairVoiceProfile,
} from "@logic/characterSetupBundle.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import { MockFactory } from "./factories/MockFactory.js";

const meetingChair = getChairMeetingVoice("en");

function optionsWithChairRealtime(
    overrides: Partial<GlobalOptions["chairRealtime"]> & {
        languages?: Partial<GlobalOptions["chairRealtime"]["languages"]>;
    } = {}
): GlobalOptions {
    const base = MockFactory.createServerOptions();
    return {
        ...base,
        chairRealtime: {
            ...base.chairRealtime,
            ...overrides,
            languages: {
                ...base.chairRealtime.languages,
                ...overrides.languages,
            },
        },
    };
}

describe("characterSetupBundle chair voice", () => {
    it("normalizes Swedish locale codes", () => {
        expect(normalizeSetupLanguage("sv-SE")).toBe("sv");
        expect(normalizeSetupLanguage("en-US")).toBe("en");
    });

    it("returns chair meeting voice from character bundle", () => {
        const voice = getChairMeetingVoice("en");
        expect(voice.voice).toBe(meetingChair.voice);
        expect(voice.voiceProvider).toBe(meetingChair.voiceProvider);
    });

    it("uses meeting voice for agent when strategy is unified", () => {
        const options = optionsWithChairRealtime({ strategy: "unified" });
        expect(getChairAgentVoice("en", options)).toEqual(getChairMeetingVoice("en"));
    });

    it("uses agentVoice override when strategy is split", () => {
        const agentVoice: ChairVoiceProfile = {
            voice: "marin",
            voiceProvider: "openai",
        };
        const options = optionsWithChairRealtime({
            strategy: "split",
            languages: {
                en: {
                    ...optionsWithChairRealtime().chairRealtime.languages.en,
                    agentVoice,
                },
            },
        });

        expect(getChairAgentVoice("en", options)).toEqual(agentVoice);
        expect(getChairMeetingVoice("en").voice).toBe(meetingChair.voice);
    });

    it("rejects elevenlabs agentVoice at validation time", () => {
        const options = optionsWithChairRealtime({
            strategy: "split",
            languages: {
                en: {
                    ...optionsWithChairRealtime().chairRealtime.languages.en,
                    agentVoice: {
                        voice: "river",
                        voiceProvider: "elevenlabs",
                    },
                },
            },
        });

        expect(() => validateChairRealtimeConfig(options)).toThrow(/cannot be used for live chair realtime/);
    });

    it("requires agentVoice when strategy is split", () => {
        const options = optionsWithChairRealtime({
            strategy: "split",
            languages: {
                en: {
                    ...optionsWithChairRealtime().chairRealtime.languages.en,
                    agentVoice: null,
                },
            },
        });

        expect(() => validateChairRealtimeConfig(options)).toThrow(/agentVoice is missing/);
        expect(() => getChairAgentVoice("en", options)).toThrow(/agentVoice is not configured/);
    });

    it("reads per-language realtime config with en fallback", () => {
        const base = optionsWithChairRealtime();
        const options = optionsWithChairRealtime({
            languages: {
                en: { ...base.chairRealtime.languages.en!, ttsModel: "fixture/tts-en" },
                sv: { ...base.chairRealtime.languages.sv!, ttsModel: "fixture/tts-sv" },
            },
        });
        expect(getChairRealtimeLanguageConfig("sv", options).ttsModel).toBe("fixture/tts-sv");
        expect(getChairRealtimeLanguageConfig("en", options).ttsModel).toBe("fixture/tts-en");
    });

    it("requires inworld llm and transcription models for human input", () => {
        const options = optionsWithChairRealtime();
        expect(() => validateHumanInputRealtimeConfig(options)).not.toThrow();
    });

    it("allows OpenAI human-input provider without inworld models", () => {
        const options = optionsWithChairRealtime();
        const withOpenAiSv: GlobalOptions = {
            ...options,
            humanInputRealtime: {
                languages: {
                    ...options.humanInputRealtime.languages,
                    sv: { provider: "openai" },
                },
            },
        };
        expect(() => validateHumanInputRealtimeConfig(withOpenAiSv)).not.toThrow();
        expect(getHumanInputRealtimeLanguageConfig("sv", withOpenAiSv).provider).toBe("openai");
    });

    it("rejects inworld human-input config without transcription model", () => {
        const options = optionsWithChairRealtime();
        const invalid: GlobalOptions = {
            ...options,
            humanInputRealtime: {
                languages: {
                    sv: {
                        provider: "inworld",
                        llmModel: "google-ai-studio/gemini-2.5-flash",
                    },
                },
            },
        };
        expect(() => validateHumanInputRealtimeConfig(invalid)).toThrow(/transcriptionModel is required/);
    });

    it("returns configured transcription models from options", () => {
        const base = optionsWithChairRealtime();
        const options: GlobalOptions = {
            ...base,
            humanInputRealtime: {
                languages: {
                    ...base.humanInputRealtime.languages,
                    sv: {
                        provider: "inworld",
                        llmModel: "test/llm",
                        transcriptionModel: "fixture/human-stt",
                    },
                },
            },
            chairRealtime: {
                ...base.chairRealtime,
                languages: {
                    ...base.chairRealtime.languages,
                    sv: {
                        ...base.chairRealtime.languages.sv!,
                        transcriptionModel: "fixture/chair-stt",
                    },
                },
            },
        };

        expect(getHumanInputRealtimeLanguageConfig("sv", options).transcriptionModel).toBe(
            "fixture/human-stt",
        );
        expect(getChairRealtimeLanguageConfig("sv", options).transcriptionModel).toBe(
            "fixture/chair-stt",
        );
    });
});
