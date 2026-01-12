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

/**
 * Wrapper for OpenAI SDK calls to handle specific low-level network errors
 * that the SDK's built-in retry mechanism skips (e.g. 'terminated', 'ECONNRESET').
 */
export const withOpenAIRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
    try {
        return await fn();
    } catch (error: unknown) {
        // Cast to an object to safely access message/code properties
        const err = error as { message?: string; code?: string | number };

        const isNetworkError =
            err.message === 'terminated' ||
            err.code === 'UND_ERR_SOCKET' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ETIMEDOUT';

        if (retries > 0 && isNetworkError) {
            Logger.warn("OpenAIService", `Retrying operation due to network error: ${err.message || err.code} (attempt ${4 - retries}/3)`);
            await new Promise(res => setTimeout(res, 1000));
            return withOpenAIRetry(fn, retries - 1);
        }
        throw error;
    }
};
