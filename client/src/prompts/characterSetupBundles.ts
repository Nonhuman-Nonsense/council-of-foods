import foodsEn from "@shared/prompts/foods_en.json";
import type { CharacterSetupData } from "@newMeeting/CharacterSetup";

// Keep Foods-specific bundle filenames behind an app-local module so shared setup
// code can use character-oriented naming that mirrors the Forest app.
export const characterSetupBundleModules = import.meta.glob<CharacterSetupData>(
    "@shared/prompts/foods_*.json",
    {
        eager: true,
        import: "default",
    },
);

export const defaultCharacterSetupBundle = foodsEn as CharacterSetupData;
