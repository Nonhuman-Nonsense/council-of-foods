import type { OpenAI } from "openai";
import { GoogleAuth } from 'google-auth-library';
import { withNetworkRetry } from "@utils/NetworkUtils.js";
import { Word } from "@utils/textUtils.js";
import { AudioSystemOptions, Speaker } from "./AudioTypes.js";
import { getGoogleLanguageCode } from "./AudioUtils.js";
import { InworldPronunciationUtils } from "@utils/InworldPronunciationUtils.js";

interface GenerateParams {
    text: string;
    speaker: Speaker;
    options: AudioSystemOptions;
    auth?: GoogleAuth; // Only needed for Gemini for now
    services?: { getOpenAI: () => OpenAI }; // For OpenAI
}

export interface AudioResult {
    audio: Buffer;
    words?: Word[];
}

export async function generateGeminiAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options, auth } = params;
    if (!auth) throw new Error("GoogleAuth required for Gemini TTS");

    const geminiModel = options.geminiVoiceModel;
    const voiceName = speaker.voice;
    let googleLangCode = getGoogleLanguageCode(options.language);
    if (options.language === 'en' && speaker.voiceLocale) {
        googleLangCode = speaker.voiceLocale;
    }

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const token = accessToken.token || '';

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize`;

    const input: { text: string; prompt?: string } = { text: text.substring(0, 4096) };
    if (speaker.voiceInstruction) input.prompt = speaker.voiceInstruction;

    const body = {
        input,
        voice: {
            languageCode: googleLangCode,
            name: voiceName,
            model_name: geminiModel
        },
        audioConfig: {
            audioEncoding: "OGG_OPUS",
            speakingRate: options.audio_speed
        }
    };

    const response = await withNetworkRetry(() => fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    }), "AudioSystemGemini");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google TTS API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    if (data.audioContent) {
        return { audio: Buffer.from(data.audioContent, 'base64') };
    } else {
        throw new Error("No audio content returned from Google TTS");
    }
}

export async function generateOpenAIAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options, services } = params;
    if (!services) throw new Error("Services required for OpenAI TTS");

    const openai = services.getOpenAI();
    const mp3 = await withNetworkRetry(() => openai.audio.speech.create({
        model: options.voiceModel,
        voice: speaker.voice as any,
        speed: options.audio_speed,
        input: text.substring(0, 4096),
        instructions: speaker.voiceInstruction,
        response_format: "opus"
    }));
    return { audio: Buffer.from(await mp3.arrayBuffer()) };
}

export async function generateInworldAudio(params: GenerateParams): Promise<AudioResult> {
    const { text, speaker, options } = params;
    const apiKey = process.env.INWORLD_API_KEY;

    // 1. Process text for IPA substitutions
    const { processedText, replacedWords } = InworldPronunciationUtils.processTextWithIPA(text);

    const url = 'https://api.inworld.ai/tts/v1/voice';

    const response = await withNetworkRetry(() => fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: processedText, // Use processed text
            voice_id: speaker.voice,
            model_id: options.inworldVoiceModel,
            temperature: speaker.voiceTemperature || 1.0,
            timestampType: "WORD",
            audio_config: {
                audio_encoding: "OGG_OPUS",
                speaking_rate: options.audio_speed
            },
        })
    }), "AudioSystemInworld");

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inworld TTS API Error: ${response.status} ${errText}`);
    }

    const data: any = await response.json();
    if (data.audioContent) {
        const buffer = Buffer.from(data.audioContent, 'base64');
        let words: Word[] | undefined;

        if (data.timestampInfo?.wordAlignment) {
            const wa = data.timestampInfo.wordAlignment;
            if (Array.isArray(wa.words) && Array.isArray(wa.wordStartTimeSeconds) && Array.isArray(wa.wordEndTimeSeconds)) {
                words = wa.words.map((word: string, i: number) => {
                    // Restore original word if it was replaced with IPA
                    const original = replacedWords.get(word);
                    return {
                        word: original || word,
                        start: wa.wordStartTimeSeconds[i],
                        end: wa.wordEndTimeSeconds[i]
                    };
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
    // All our providers (OpenAI, Gemini, Inworld) now return OGG/Opus.
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
