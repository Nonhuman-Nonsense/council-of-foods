import OpenAI from "openai";
import { config } from "../config.js";
import { Logger } from "@utils/Logger.js";

let openai: OpenAI;

export const initOpenAI = (): void => {
    openai = new OpenAI({
        apiKey: config.COUNCIL_OPENAI_API_KEY,
        maxRetries: 3,
        timeout: 30 * 1000 // 30 seconds
    });
};

export const getOpenAI = (): OpenAI => {
    if (!openai) initOpenAI();
    return openai;
};


