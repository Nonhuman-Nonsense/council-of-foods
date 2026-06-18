import type { Word } from "@shared/textUtils.js";

export interface CharacterAlignment {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
}

function isSpokenCharacter(char: string): boolean {
    return /[\p{L}\p{N}]/u.test(char);
}

export function characterAlignmentToWords(alignment: CharacterAlignment): Word[] {
    const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
    const words: Word[] = [];
    let currentWord = "";
    let wordStart: number | null = null;
    let wordEnd: number | null = null;

    for (let i = 0; i < characters.length; i++) {
        const char = characters[i] ?? "";
        const start = starts[i];
        const end = ends[i];
        if (typeof start !== "number" || typeof end !== "number") {
            continue;
        }

        if (isSpokenCharacter(char)) {
            if (currentWord === "") {
                wordStart = start;
            }
            currentWord += char;
            wordEnd = end;
            continue;
        }

        if (currentWord && wordStart !== null && wordEnd !== null) {
            words.push({ word: currentWord, start: wordStart, end: wordEnd });
            currentWord = "";
            wordStart = null;
            wordEnd = null;
        }
    }

    if (currentWord && wordStart !== null && wordEnd !== null) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
    }

    return words;
}
