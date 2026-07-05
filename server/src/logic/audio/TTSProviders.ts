import type OpenAI from "openai";
import { withNetworkRetry } from "@utils/NetworkUtils.js";
import { Word } from "@shared/textUtils.js";
import { AudioSystemOptions, Speaker } from "./AudioTypes.js";
import { PronunciationUtils } from "@utils/PronunciationUtils.js";
import { characterAlignmentToWords, type CharacterAlignment } from "@utils/ElevenLabsAlignmentUtils.js";

const INWORLD_TTS_2_MODEL = "inworld-tts-2";
/** Opus at 48 kHz sample rate, 128 kbps — matches our other OGG/Opus providers. */
export const ELEVENLABS_OPUS_OUTPUT_FORMAT = "opus_48000_128";
const ELEVENLABS_DEFAULT_STABILITY = 0.5;
const ELEVENLABS_DEFAULT_STYLE = 0;

interface GenerateParams {
    text: string;
    speaker: Speaker;
    options: AudioSystemOptions;
    services?: { getOpenAI: () => OpenAI }; // For OpenAI
    /** If true, `text` is already pronunciation-processed; skip PronunciationUtils. */
    preprocessed?: boolean;
    /** Pre-built replacement map when `preprocessed` is true, for subtitle restoration. */
    replacedWords?: Map<string, string>;
}

export interface AudioResult {
    audio: Buffer;
    words?: Word[];
}

function hasSpokenToken(word: string): boolean {
    return word.toLowerCase().replace(/[^\w]|_/g, "").length > 0;
}

export async function generateOpenAIAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options, services } = params;
    if (!services) throw new Error("Services required for OpenAI TTS");

    const openai = services.getOpenAI();
    const mp3 = await withNetworkRetry(() => openai.audio.speech.create({
        model: options.voiceModel,
        voice: speaker.voice as OpenAI.Audio.SpeechCreateParams["voice"],
        speed: speaker.voiceSpeed ?? options.defaultAudioSpeed,
        input: text,
        instructions: speaker.voiceInstruction,
        response_format: "opus"
    }));
    return { audio: Buffer.from(await mp3.arrayBuffer()) };
}

export async function generateElevenLabsAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options } = params;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY required for ElevenLabs TTS");

    const language = options.language ?? 'en';
    const { processedText } = PronunciationUtils.processText(text, language, { includeIpa: false });

    const voiceId = speaker.voice;
    const modelId = options.elevenlabsVoiceModel;
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`);
    url.searchParams.set("output_format", ELEVENLABS_OPUS_OUTPUT_FORMAT);

    const body: Record<string, unknown> = {
        text: processedText,
        model_id: modelId,
        voice_settings: {
            speed: speaker.voiceSpeed ?? options.defaultAudioSpeed,
            stability: speaker.voiceStability ?? ELEVENLABS_DEFAULT_STABILITY,
            style: speaker.voiceStyle ?? ELEVENLABS_DEFAULT_STYLE,
        },
    };

    const locale = speaker.voiceLocale?.trim();
    if (locale) {
        body.language_code = locale.split("-")[0];
    }

    const response = await withNetworkRetry(() => fetch(url.toString(), {
        method: "POST",
        headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    }), "AudioSystemElevenLabs");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs TTS API Error: ${response.status} ${errText}`);
    }

    interface ElevenLabsTimestampResponse {
        audio_base64?: string;
        alignment?: CharacterAlignment | null;
        normalized_alignment?: CharacterAlignment | null;
    }

    const data = (await response.json()) as ElevenLabsTimestampResponse;
    if (!data.audio_base64) {
        throw new Error("No audio content returned from ElevenLabs TTS");
    }

    const alignment = data.normalized_alignment ?? data.alignment;
    let words: Word[] | undefined;
    if (alignment?.characters?.length) {
        words = characterAlignmentToWords(alignment);
    }

    return {
        audio: Buffer.from(data.audio_base64, "base64"),
        words,
    };
}

export async function generateInworldAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options, preprocessed, replacedWords: passedReplacedWords } = params;
    const apiKey = process.env.INWORLD_API_KEY;

    const language = options.language ?? 'en';
    const { processedText, replacedWords } = preprocessed
        ? { processedText: text, replacedWords: passedReplacedWords ?? new Map<string, string>() }
        : PronunciationUtils.processText(text, language, { includeIpa: true });

    const url = 'https://api.inworld.ai/tts/v1/voice';
    const locale = speaker.voiceLocale?.trim() || undefined;
    const modelId = locale ? INWORLD_TTS_2_MODEL : options.inworldVoiceModel;

    const payload: Record<string, unknown> = {
        text: processedText,
        voice_id: speaker.voice,
        model_id: modelId,
        timestampType: "WORD",
        audio_config: {
            audio_encoding: "OGG_OPUS",
            speaking_rate: speaker.voiceSpeed ?? options.defaultAudioSpeed
        },
    };

    if (locale) payload.language = locale;
    // TTS-2 ignores temperature; deliveryMode is optional for later.
    if (modelId !== INWORLD_TTS_2_MODEL) {
        payload.temperature = speaker.voiceTemperature || 1.0;
    }

    const response = await withNetworkRetry(() => fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    }), "AudioSystemInworld");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inworld TTS API Error: ${response.status} ${errText}`);
    }

    interface InworldTtsJson {
        audioContent?: string;
        timestampInfo?: {
            wordAlignment?: {
                words?: string[];
                wordStartTimeSeconds?: number[];
                wordEndTimeSeconds?: number[];
            };
        };
    }

    const data = (await response.json()) as InworldTtsJson;
    if (data.audioContent) {
        const buffer = Buffer.from(data.audioContent, 'base64');
        let words: Word[] | undefined;

        if (data.timestampInfo?.wordAlignment) {
            const wa = data.timestampInfo.wordAlignment;
            const waWords = wa.words;
            const starts = wa.wordStartTimeSeconds;
            const ends = wa.wordEndTimeSeconds;
            if (Array.isArray(waWords) && Array.isArray(starts) && Array.isArray(ends)) {
                words = waWords.flatMap((word: string, i: number) => {
                    // Inworld includes punctuation, spaces, and empty strings as timed alignment entries.
                    // The sentence mapper expects spoken tokens only; otherwise long sentences compress.
                    if (!hasSpokenToken(word) || typeof starts[i] !== "number" || typeof ends[i] !== "number") {
                        return [];
                    }

                    // Restore original word if it was replaced with IPA
                    const original = replacedWords.get(word);
                    return [{
                        word: original || word,
                        start: starts[i],
                        end: ends[i]
                    }];
                });
            }
        }

        return { audio: buffer, words };
    } else {
        throw new Error("No audio content returned from Inworld TTS");
    }
}

export async function getWhisperWords(buffer: Buffer, services: { getOpenAI: () => OpenAI }): Promise<Word[]> {
    const openai = services.getOpenAI();
    // All our providers (OpenAI, Inworld, ElevenLabs) return OGG/Opus.
    // FFmpeg (used by Whisper) performs content sniffing, but correct extension helps.
    const audioFile = new File([new Uint8Array(buffer)], "speech.ogg", { type: "audio/ogg" });
    const transcription = await withNetworkRetry(() => openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"]
    }), "AudioSystemWhisper");
    return (transcription.words || []) as Word[];
}
