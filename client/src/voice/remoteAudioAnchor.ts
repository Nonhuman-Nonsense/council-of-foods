export type RemoteAudioAnchor = {
  /** Arm for the next audible onset. */
  arm: () => void;
  /** Stop the analyser loop and release Web Audio resources. */
  dispose: () => void;
};

export type RemoteAudioAnchorOptions = {
  track: MediaStreamTrack;
  onAudioStart: (nowMs: number) => void;
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
  let firedForCurrentArm = false;
  let quietSinceMs: number | null = null;

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

    if (armed && !firedForCurrentArm && rms >= silenceThreshold) {
      armed = false;
      firedForCurrentArm = true;
      quietSinceMs = null;
      log?.("remote audio anchor fired", { rms });
      onAudioStart(nowMs);
    } else {
      releaseQuietStateIfSilent(rms, nowMs);
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    arm: () => {
      if (disposed) return;
      armed = true;
      quietSinceMs = null;
      if (ctx.state === "suspended") {
        void ctx.resume().catch((err) => log?.("remote audio anchor resume failed", err));
      }
    },

    dispose: () => {
      if (disposed) return;
      disposed = true;
      armed = false;
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
