/**
 * Listens to the agent's incoming audio track and tells sound from pauses.
 *
 * Everything the captions need from the audio comes from one reading, kept here once: the
 * track is either sounding or in a pause, and a pause is quiet lasting {@link PAUSE_MS}.
 * Shorter quiet is a dip between words and still counts as sound. Every question the
 * captions ask — where a reply starts, whether the old reply has stopped, whether anything
 * is playing — and the `[SUBS] AUDIO` log lines are answered from that same state, so they
 * cannot disagree about what a pause is.
 */
export type RemoteAudioAnchor = {
  /**
   * Report the start of the next reply through `onAudioStart`: the first sound after a
   * pause. Sound already playing when this is called is not a start.
   *
   * Pass `true` to first wait for the audio playing now to stop — a pause that begins
   * after this call — reported through `onArmed`. For a reply cut off or still draining,
   * whose end the playback clock cannot tell.
   */
  arm: (waitForPauseFirst?: boolean) => void;
  /**
   * Returns the AudioContext's hardware-clock time in seconds.
   * Advances continuously regardless of DTX silence — use this as the
   * subtitle playback clock instead of HTMLAudioElement.currentTime.
   */
  getCtxTime: () => number;
  /** Whether the track is sounding: not in a pause. A dip between words still counts. */
  isAudible: () => boolean;
  /**
   * Resume the AudioContext, which starts suspended without a user gesture.
   * Its `currentTime` is the subtitle clock, so a suspended context leaves
   * captions frozen even when the audio element itself is playing.
   */
  resume: () => void;
  /** The AudioContext's state — "suspended" means the subtitle clock is not running. */
  getState: () => AudioContextState;
  /** Stop the analyser loop and release Web Audio resources. */
  dispose: () => void;
};

export type RemoteAudioAnchorOptions = {
  track: MediaStreamTrack;
  /** A reply's audio started, after `arm`. `ctxTime` is `AudioContext.currentTime` at that moment — the subtitle clock's anchor. */
  onAudioStart: (nowMs: number, ctxTime: number) => void;
  /**
   * `arm(true)`'s pause arrived: the audio playing when it was called has stopped. The
   * reliable signal for a cut-off reply, whose audio can keep draining for a second or two
   * after `output_audio_buffer.clear` is sent.
   */
  onArmed?: () => void;
  silenceThreshold?: number;
  fftSize?: number;
  log?: (...args: unknown[]) => void;
};

const DEFAULT_SILENCE_THRESHOLD = 0.01;
const DEFAULT_FFT_SIZE = 512;
/**
 * Quiet this long is a pause; anything shorter is a dip inside speech (~100 ms between
 * words). Not longer: the audio of a cut-off reply can run almost straight into the next
 * one, and a gap read as a dip puts the next reply's captions a sentence late, on a pause
 * inside it instead (observed: a 203 ms gap).
 */
export const PAUSE_MS = 150;

const getNow = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

function createAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  return new AudioContextCtor();
}

function computeRms(data: Uint8Array): number {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const centered = (data[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / data.length);
}

export function createRemoteAudioAnchor(options: RemoteAudioAnchorOptions): RemoteAudioAnchor {
  const {
    track,
    onAudioStart,
    onArmed,
    silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
    fftSize = DEFAULT_FFT_SIZE,
    log,
  } = options;

  const ctx = createAudioContext();
  const stream = new MediaStream([track]);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let rafId: number | null = null;
  let disposed = false;

  /** The one reading: sounding, or in a pause. The track starts silent. */
  let sounding = false;
  /** When sound was last heard, on both clocks. */
  let lastSoundMs: number | null = null;
  let lastSoundCtxSec = 0;

  /** What `arm` asked for: nothing, the next start of sound, or first a pause after `armedAtMs`. */
  let waitingFor: "nothing" | "start" | "pause" = "nothing";
  let armedAtMs = 0;

  const tick = () => {
    if (disposed) return;
    analyser.getByteTimeDomainData(data);
    const nowMs = getNow();
    const loud = computeRms(data) >= silenceThreshold;

    if (loud) {
      lastSoundMs = nowMs;
      lastSoundCtxSec = ctx.currentTime;
      if (!sounding) {
        sounding = true;
        log?.(`[SUBS] AUDIO sound ctxTime=${ctx.currentTime.toFixed(3)}`);
        if (waitingFor === "start") {
          waitingFor = "nothing";
          onAudioStart(nowMs, ctx.currentTime);
        }
      }
    } else if (sounding && lastSoundMs != null && nowMs - lastSoundMs >= PAUSE_MS) {
      sounding = false;
      log?.(`[SUBS] AUDIO quiet ctxTime=${lastSoundCtxSec.toFixed(3)}`);
    }

    // A pause that began before `arm(true)` says nothing about the audio it was waiting on,
    // so the quiet is counted from whichever came later.
    if (waitingFor === "pause" && !loud && nowMs - Math.max(lastSoundMs ?? -Infinity, armedAtMs) >= PAUSE_MS) {
      waitingFor = "start";
      onArmed?.();
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    getCtxTime: () => ctx.currentTime,

    isAudible: () => sounding,

    getState: () => ctx.state,

    resume: () => {
      if (disposed || ctx.state !== "suspended") return;
      void ctx.resume().catch((err) => log?.("remote audio anchor resume failed", err));
    },

    arm: (waitForPauseFirst?: boolean) => {
      if (disposed) return;
      waitingFor = waitForPauseFirst ? "pause" : "start";
      armedAtMs = getNow();
      if (ctx.state === "suspended") {
        void ctx.resume().catch((err) => log?.("remote audio anchor resume failed", err));
      }
    },

    dispose: () => {
      if (disposed) return;
      disposed = true;
      waitingFor = "nothing";
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      source.disconnect();
      analyser.disconnect();
      if (ctx.state !== "closed") {
        void ctx.close().catch((err) => log?.("remote audio anchor close failed", err));
      }
    },
  };
}
