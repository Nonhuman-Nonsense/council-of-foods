import type { ClientKeyResponse } from "@shared/SocketTypes.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { getOpenAI } from "@services/OpenAIService.js";
import { Logger } from "@utils/Logger.js";

/**
 * Fetch an ephemeral OpenAI Realtime client secret for speech-to-text transcription.
 */
export async function getClientKey(language: string): Promise<ClientKeyResponse> {
    const options = getGlobalOptions();

    const sessionConfig = JSON.stringify({
        session: {
            type: "transcription",
            audio: {
                input: {
                    format: { type: "audio/pcm", rate: 24000 },
                    noise_reduction: { type: "near_field" },
                    transcription: {
                        model: options.transcribeModel,
                        prompt: options.transcribePrompt[language],
                        language,
                    },
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500,
                    },
                },
            },
        },
    });

    const openai = getOpenAI();
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openai.apiKey}`,
            "Content-Type": "application/json",
        },
        body: sessionConfig,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI client_secrets request failed (${response.status}): ${text}`);
    }

    const data: ClientKeyResponse = await response.json();
    await Logger.info("api", "POST /api/clientkey: client key issued");
    return data;
}
