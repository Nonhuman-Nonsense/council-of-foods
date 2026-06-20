export type ButtonLedMode = "off" | "pulse" | "on";

export function computeButtonLedMode(params: {
  pushToTalkMode: boolean;
  muted: boolean;
  isConnecting: boolean;
  voiceError: string | null;
  pressed: boolean;
}): ButtonLedMode {
  if (!params.pushToTalkMode || params.muted || params.isConnecting || params.voiceError) {
    return "off";
  }
  if (params.pressed) {
    return "on";
  }
  return "pulse";
}

export function isButtonInputEnabled(mode: ButtonLedMode): boolean {
  return mode === "pulse" || mode === "on";
}
