import { describe, it, expect } from "vitest";
import {
    getChairAgentVoice,
    getChairMeetingVoice,
    getChairRealtimeLanguageConfig,
    normalizeSetupLanguage,
    validateChairRealtimeConfig,
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
        const options = optionsWithChairRealtime();
        expect(getChairRealtimeLanguageConfig("sv", options).ttsModel).toBe("inworld-tts-2");
        expect(getChairRealtimeLanguageConfig("en", options).ttsModel).toBe("inworld-tts-1.5-max");
    });
});
