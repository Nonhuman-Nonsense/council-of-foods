import { METER_METHODOLOGY_PATH } from "@shared/MeterTypes";

/** What each model does in the council, and readable names for EcoLogits' data-centre zones. */

export const MODEL_ROLES: Record<string, string> = {
  "inworld|mistral/mistral-large-3": "Writes what the council members say",
  "inworld|google-ai-studio/gemini-2.5-flash": "Thinks for the chair and the guide, and picks who speaks next",
  "inworld|inworld-tts-1.5-max": "Gives the council its voices",
  "inworld|inworld-tts-1.5-mini": "Gives the council its voices",
  "inworld|inworld-tts-2": "Gives the council its voices",
  "elevenlabs|eleven_flash_v2_5": "Gives the council its voices",
  "inworld|soniox/stt-rt-v4": "Listens to visitors",
  "inworld|inworld/inworld-stt-1": "Listens to visitors",
};

export const ZONE_NAMES: Record<string, string> = {
  USA: "United States",
  SWE: "Sweden",
  NLD: "Netherlands",
  WOR: "somewhere in the world",
};

/** "Sweden", or "Sweden or United States" where it is not known which. */
export function zoneName(zones: string[]): string {
  return zones.map((zone) => ZONE_NAMES[zone] ?? zone).join(" or ");
}

/** Where the methodology page lives, for the QR code. */
export function methodologyUrl(): string {
  return `${window.location.origin}${METER_METHODOLOGY_PATH}`;
}
