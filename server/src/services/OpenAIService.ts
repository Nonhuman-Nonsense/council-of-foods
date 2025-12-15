import OpenAI from "openai";

let openai: OpenAI;

export const initOpenAI = (): void => {
    if (!process.env.COUNCIL_OPENAI_API_KEY) {
        throw new Error("COUNCIL_OPENAI_API_KEY environment variable not set.");
    }
    openai = new OpenAI({ apiKey: process.env.COUNCIL_OPENAI_API_KEY });
};

export const getOpenAI = (): OpenAI => {
    if (!openai) initOpenAI();
    return openai;
};
