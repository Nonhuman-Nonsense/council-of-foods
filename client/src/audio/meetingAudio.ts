import { useEffect, type RefObject } from "react";

/**
 * Council meeting playback bus: TTS output + subtitle clock.
 *
 * Foods uses only this context. Forest adds a separate scene bus (ambient +
 * BeingAudio) that is not suspended for meta-agent — see `sceneAudio.ts` when
 * merged on the Forest side.
 */
export type MeetingAudioContextRef = RefObject<AudioContext | null>;

export function createMeetingAudioContext(): AudioContext {
  type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available in this environment");
  }
  return new AudioContextCtor();
}

/** Suspend or resume the meeting playback bus (mid-sentence freeze/resume). */
export function setMeetingPlaybackSuspended(
  meetingAudioContext: MeetingAudioContextRef,
  suspended: boolean,
): void {
  const ctx = meetingAudioContext.current;
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

/** Keeps meeting playback suspended while `suspended` is true (Main-owned state). */
export function useMeetingPlaybackSuspended(
  meetingAudioContext: MeetingAudioContextRef,
  suspended: boolean,
): void {
  useEffect(() => {
    setMeetingPlaybackSuspended(meetingAudioContext, suspended);
  }, [meetingAudioContext, suspended]);
}
