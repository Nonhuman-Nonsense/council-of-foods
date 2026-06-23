import fs from "node:fs";
import path from "node:path";
import { chairIdFromCharacters, CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata.js";

type CharacterSetupDataFile = {
    characters: Array<{
        id: string;
        voice: string;
        voiceProvider?: string;
        voiceInstruction?: string;
        voiceSpeed?: number;
    }>;
};

const sharedPromptsDir = path.join(process.cwd(), "../shared/prompts");

function readCharacterSetupBundle(language: string): CharacterSetupDataFile {
    const requestedPath = path.join(sharedPromptsDir, `${CHARACTERS_FILE}_${language}.json`);
    const fallbackPath = path.join(sharedPromptsDir, `${CHARACTERS_FILE}_en.json`);
    const filePath = fs.existsSync(requestedPath) ? requestedPath : fallbackPath;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CharacterSetupDataFile;
}

export const defaultCharacterSetupBundle = JSON.parse(
    fs.readFileSync(path.join(sharedPromptsDir, `${CHARACTERS_FILE}_en.json`), "utf-8"),
) as CharacterSetupDataFile;

/** Chair id from the default character-setup bundle (same convention as client `CHAIR_ID`). */
export const CHAIR_ID = chairIdFromCharacters(defaultCharacterSetupBundle.characters);

export function getCharacterSetupBundle(language: string): CharacterSetupDataFile {
    return readCharacterSetupBundle(language);
}
