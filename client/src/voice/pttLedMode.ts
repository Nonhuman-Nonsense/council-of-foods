export type PttLedMode = "off" | "pulse" | "on";

export function computePttLedMode(params: {
  pushToTalkMode: boolean;
  muted: boolean;
  isConnecting: boolean;
  voiceError: string | null;
  pressed: boolean;
}): PttLedMode {
  if (!params.pushToTalkMode || params.muted || params.isConnecting || params.voiceError) {
    return "off";
  }
  if (params.pressed) {
    return "on";
  }
  return "pulse";
}

export function isPttInputEnabled(mode: PttLedMode): boolean {
  return mode === "pulse" || mode === "on";
}
