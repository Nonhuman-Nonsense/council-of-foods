export const CHARACTERS_FILE = "foods" as const;

/** Chair/moderator is always `characters[0]` in character-setup JSON (foods_*.json, beings_*.json, …). */
export const CHAIR_CHARACTER_INDEX = 0;

/** Chair id from a loaded character-setup bundle. */
export function chairIdFromCharacters(characters: readonly { id: string }[]): string {
  const chair = characters[CHAIR_CHARACTER_INDEX];
  if (!chair?.id) {
    throw new Error(`Missing chair character at index ${CHAIR_CHARACTER_INDEX}`);
  }
  return chair.id;
}
