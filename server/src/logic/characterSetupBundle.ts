import fs from "node:fs";
import path from "node:path";
import { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata.js";

type CharacterSetupDataFile = {
    characters: Array<{
        id: string;
        voice: string;
        voiceSpeed?: number;
    }>;
};

const characterSetupPath = path.join(process.cwd(), "../shared/prompts", `${CHARACTERS_FILE}_en.json`);

export const defaultCharacterSetupBundle = JSON.parse(
    fs.readFileSync(characterSetupPath, "utf-8"),
) as CharacterSetupDataFile;
