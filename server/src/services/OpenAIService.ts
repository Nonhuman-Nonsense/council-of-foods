import OpenAI from "openai";
import { config } from "../config.js";
import { OUTBOUND_HTTP_TIMEOUT_MS } from "@utils/NetworkUtils.js";

let openai: OpenAI;

export const initOpenAI = (): void => {
    openai = new OpenAI({
        apiKey: config.COUNCIL_OPENAI_API_KEY,
        maxRetries: 3,
        timeout: OUTBOUND_HTTP_TIMEOUT_MS,
    });
};

export const getOpenAI = (): OpenAI => {
    if (!openai) initOpenAI();
    return openai;
};


