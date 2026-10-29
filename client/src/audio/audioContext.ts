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

/**
 * Suspend or resume the shared audio bus (user pause / tab blur / overlays).
 *
 * Asks for the wanted state every time rather than reading `ctx.state` first: `state` only
 * changes once a pending `resume()` or `suspend()` has finished, so a pause arriving just after a
 * resume (still "suspended") was skipped and the sound played on under a paused meeting. The
 * context applies the calls in order, so the last one asked for is where it ends up.
 */
export function setAudioSuspended(audioContext: AudioContextRef, suspended: boolean): void {
  const ctx = audioContext.current;
  if (!ctx || ctx.state === "closed") return;
  void (suspended ? ctx.suspend() : ctx.resume()).catch(() => {});
}

/** Keeps the shared audio bus suspended while `suspended` is true (Main-owned). */
export function useAudioSuspended(audioContext: AudioContextRef, suspended: boolean): void {
  useEffect(() => {
    setAudioSuspended(audioContext, suspended);
  }, [audioContext, suspended]);
}
