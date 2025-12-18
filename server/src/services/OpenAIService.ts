import OpenAI from "openai";

import { config } from "../config.js";

let openai: OpenAI;

export const initOpenAI = (): void => {
    openai = new OpenAI({ apiKey: config.COUNCIL_OPENAI_API_KEY });
};

export const getOpenAI = (): OpenAI => {
    if (!openai) initOpenAI();
    return openai;
};
