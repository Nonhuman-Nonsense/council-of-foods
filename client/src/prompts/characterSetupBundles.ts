import characterSetupEn from "@shared/prompts/foods_en.json";
import type { CharacterSetupData } from "@newMeeting/CharacterSetup";
export { CHARACTERS_FILE, CHARACTERS_PLACEHOLDER } from "@shared/prompts/characterSetupMetadata";

// Keep Foods-specific bundle filenames behind an app-local module so shared setup
// code can use character-oriented naming that mirrors the Forest app.
export const characterSetupBundleModules = import.meta.glob<CharacterSetupData>(
    "@shared/prompts/foods_*.json",
    {
        eager: true,
        import: "default",
    },
);

export const defaultCharacterSetupBundle = characterSetupEn as CharacterSetupData;
