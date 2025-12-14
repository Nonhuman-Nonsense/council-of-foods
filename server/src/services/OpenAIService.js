import OpenAI from "openai";

let openai;

export const initOpenAI = () => {
    if (!process.env.COUNCIL_OPENAI_API_KEY) {
        throw new Error("COUNCIL_OPENAI_API_KEY environment variable not set.");
    }
    openai = new OpenAI({ apiKey: process.env.COUNCIL_OPENAI_API_KEY });
};

export const getOpenAI = () => {
    if (!openai) initOpenAI();
    return openai;
};
