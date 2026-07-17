import fs from "node:fs";
import path from "node:path";
import { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata";
import { SHARED_PROMPTS_DIR } from "./sharedPromptsDir";
import type { Character } from "@shared/ModelTypes";

type CharacterSetupDataFile = {
    characters: Character[];
};

export function loadCharacterSetupData(language = "en"): CharacterSetupDataFile {
    const filePath = path.join(SHARED_PROMPTS_DIR, `${CHARACTERS_FILE}_${language}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CharacterSetupDataFile;
}

export const characterSetupEn = loadCharacterSetupData("en");
