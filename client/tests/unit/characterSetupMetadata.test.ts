// @vitest-environment node
import { describe, it, expect } from "vitest";
import foodsEn from "@shared/prompts/foods_en.json";
import {
  CHAIR_CHARACTER_INDEX,
  CHARACTERS_FILE,
  chairIdFromCharacters,
} from "@shared/prompts/characterSetupMetadata";

describe("characterSetupMetadata", () => {
  it("exports the characters file key", () => {
    expect(CHARACTERS_FILE).toBe("foods");
  });

  it("derives chair id from the default character bundle", () => {
    expect(chairIdFromCharacters(foodsEn.characters)).toBe("water");
    expect(foodsEn.characters[CHAIR_CHARACTER_INDEX].id).toBe("water");
  });
});
