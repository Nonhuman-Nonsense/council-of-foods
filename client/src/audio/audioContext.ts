import { useEffect, type RefObject } from "react";

/** Shared Web Audio bus: council TTS, subtitle clock, and (on Forest) scene bed loops. */
export type AudioContextRef = RefObject<AudioContext | null>;

export function createAudioContext(): AudioContext {
  type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available in this environment");
  }
  return new AudioContextCtor();
}

/** Suspend or resume the shared audio bus (user pause / tab blur / overlays). */
export function setAudioSuspended(audioContext: AudioContextRef, suspended: boolean): void {
  const ctx = audioContext.current;
  if (!ctx) return;

  if (suspended) {
    if (ctx.state !== "suspended") {
      void ctx.suspend();
    }
    return;
  }

  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

/** Keeps the shared audio bus suspended while `suspended` is true (Main-owned). */
export function useAudioSuspended(audioContext: AudioContextRef, suspended: boolean): void {
  useEffect(() => {
    setAudioSuspended(audioContext, suspended);
  }, [audioContext, suspended]);
}
