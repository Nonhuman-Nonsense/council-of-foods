import type { RefObject } from "react";

/**
 * Forest scene bed bus: ambient loop + character BeingAudio loops.
 *
 * Not used in Council of Foods. Forest creates this context in Main and passes
 * it to `Forest.tsx` only. Meta-agent freeze must not suspend the scene bus.
 */
export type SceneAudioContextRef = RefObject<AudioContext | null>;

export function createSceneAudioContext(): AudioContext {
  type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available in this environment");
  }
  return new AudioContextCtor();
}
