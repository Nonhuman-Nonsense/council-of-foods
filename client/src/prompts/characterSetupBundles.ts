import type { CharacterSetupData } from "@shared/ModelTypes";
export { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata";
import { chairIdFromCharacters, CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata";

// Keep Foods-specific bundle filenames behind an app-local module so shared setup
// code can use character-oriented naming that mirrors the Forest app.
const promptModules = import.meta.glob<CharacterSetupData>(
    "@shared/prompts/*.json",
    {
        eager: true,
        import: "default",
    },
);

export const characterSetupBundleModules = Object.fromEntries(
    Object.entries(promptModules).filter(([path]) =>
        path.endsWith(`/${CHARACTERS_FILE}_en.json`) || new RegExp(`/${CHARACTERS_FILE}_[^/]+\\.json$`).test(path),
    ),
) as Record<string, CharacterSetupData>;

const defaultCharacterSetupModuleKey = Object.keys(characterSetupBundleModules).find((path) =>
    path.endsWith(`/${CHARACTERS_FILE}_en.json`),
);

if (!defaultCharacterSetupModuleKey) {
    throw new Error(`Missing default character setup bundle for ${CHARACTERS_FILE}_en.json`);
}

export const defaultCharacterSetupBundle = characterSetupBundleModules[defaultCharacterSetupModuleKey];

/** Chair id from the default character-setup bundle (same convention as server `CHAIR_ID`). */
export const CHAIR_ID = chairIdFromCharacters(defaultCharacterSetupBundle.characters);
