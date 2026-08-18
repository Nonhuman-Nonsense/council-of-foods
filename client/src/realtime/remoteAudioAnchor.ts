export type RemoteAudioAnchor = {
  /**
   * Arm for the next audible onset.
   * Pass `true` to wait for a silence period before arming — this prevents
   * the anchor from firing on audio that is still playing from a previous
   * response when the new response.created arrives.
   */
  arm: (waitForSilenceFirst?: boolean) => void;
  /**
   * Returns the AudioContext's hardware-clock time in seconds.
   * Advances continuously regardless of DTX silence — use this as the
   * subtitle playback clock instead of HTMLAudioElement.currentTime.
   */
  getCtxTime: () => number;
  /**
   * Resume the AudioContext, which starts suspended without a user gesture.
   * Its `currentTime` is the subtitle clock, so a suspended context leaves
   * captions frozen even when the audio element itself is playing.
   */
  resume: () => void;
  /** Stop the analyser loop and release Web Audio resources. */
  dispose: () => void;
};

export type RemoteAudioAnchorOptions = {
  track: MediaStreamTrack;
  /** Called when the first audible onset is detected after arming. `ctxTime` is `AudioContext.currentTime` at the moment of detection — use it as the subtitle clock anchor. */
  onAudioStart: (nowMs: number, ctxTime: number) => void;
  /**
   * Called when `arm(true)`'s "wait for silence" completes — sustained real
   * silence has been confirmed on the track. Reliable signal for "the
   * previous response's audio has actually stopped," including after a
   * client-triggered interrupt (`output_audio_buffer.clear`), where audio can
   * keep draining for a second or two after the command is sent.
   */
  onArmed?: () => void;
  silenceThreshold?: number;
  silenceMs?: number;
  fftSize?: number;
  log?: (...args: unknown[]) => void;
};

const DEFAULT_SILENCE_THRESHOLD = 0.01;
const DEFAULT_SILENCE_MS = 250;
const DEFAULT_FFT_SIZE = 512;

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
    silenceMs = DEFAULT_SILENCE_MS,
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
  let armed = false;
  let waitingForSilence = false;
  let firedForCurrentArm = false;
  let quietSinceMs: number | null = null;
  /** Separate debounce clock for waitingForSilence, so a single sub-threshold
   *  frame (e.g. a natural gap between words) doesn't prematurely arm on
   *  audio that's still playing from the previous response. */
  let waitingQuietSinceMs: number | null = null;

  const releaseQuietStateIfSilent = (rms: number, nowMs: number) => {
    if (!firedForCurrentArm) return;
    if (rms >= silenceThreshold) {
      quietSinceMs = null;
      return;
    }
    quietSinceMs ??= nowMs;
    if (nowMs - quietSinceMs >= silenceMs) {
      firedForCurrentArm = false;
      quietSinceMs = null;
    }
  };

  const tick = () => {
    if (disposed) return;
    analyser.getByteTimeDomainData(data);
    const nowMs = getNow();
    const rms = computeRms(data);

    if (waitingForSilence) {
      if (rms < silenceThreshold) {
        waitingQuietSinceMs ??= nowMs;
        if (nowMs - waitingQuietSinceMs >= silenceMs) {
          waitingForSilence = false;
          armed = true;
          firedForCurrentArm = false;
          quietSinceMs = null;
          waitingQuietSinceMs = null;
          log?.("remote audio anchor: silence detected, now armed");
          onArmed?.();
        }
      } else {
        waitingQuietSinceMs = null;
      }
    } else if (armed && !firedForCurrentArm && rms >= silenceThreshold) {
      armed = false;
      firedForCurrentArm = true;
      quietSinceMs = null;
      log?.("remote audio anchor fired", { rms });
      onAudioStart(nowMs, ctx.currentTime);
    } else {
      releaseQuietStateIfSilent(rms, nowMs);
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    getCtxTime: () => ctx.currentTime,

    resume: () => {
      if (disposed || ctx.state !== "suspended") return;
      void ctx.resume().catch((err) => log?.("remote audio anchor resume failed", err));
    },

    arm: (waitForSilenceFirst?: boolean) => {
      if (disposed) return;
      if (waitForSilenceFirst) {
        waitingForSilence = true;
        armed = false;
      } else {
        waitingForSilence = false;
        armed = true;
      }
      quietSinceMs = null;
      waitingQuietSinceMs = null;
      if (ctx.state === "suspended") {
        void ctx.resume().catch((err) => log?.("remote audio anchor resume failed", err));
      }
    },

    dispose: () => {
      if (disposed) return;
      disposed = true;
      armed = false;
      waitingForSilence = false;
      waitingQuietSinceMs = null;
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
