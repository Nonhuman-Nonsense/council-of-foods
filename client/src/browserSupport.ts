/**
 * What a browser needs to run the council as the work is meant to be experienced: hear the
 * meeting (Ogg/Opus through WebAudio), keep a live meeting (WebSocket) and talk to it
 * (microphone + WebRTC). A browser missing any of these gets the unsupported screen rather
 * than a half-working version, and is told to switch browser before anything breaks.
 *
 * Runs alongside startup (index.tsx), not before it, so supported browsers wait for nothing.
 * Browsers too old to run the bundle at all never get here; index.html covers those.
 */

export type BrowserFeature = "modern-js" | "websocket" | "webaudio" | "ogg-opus" | "microphone" | "webrtc";

/**
 * A blink of Ogg/Opus silence (163 bytes): the format all meeting and character audio is
 * stored in. Safari before 18.4 can't decode Ogg, and there is no reliable way to ask
 * short of decoding a real file — `canPlayType` answers for media elements, not WebAudio.
 */
const OGG_OPUS_SAMPLE =
  "T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAAAASZW+VAEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABPgEAAAAAAAAAAAAAAIAAADbWnPVAgcGCAvmOyOrYAgIrLMOxg==";

/** A decode that hasn't answered by now counts as supported: the check must never lock out a working browser. */
const DECODE_TIMEOUT_MS = 3000;

type SupportScope = typeof globalThis & {
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

function hasModernJs(scope: SupportScope): boolean {
  // The newest APIs the client leans on; a browser with these runs the bundle's syntax too.
  return (
    typeof scope.structuredClone === "function" &&
    typeof scope.AbortSignal?.timeout === "function" &&
    typeof Array.prototype.at === "function" &&
    typeof scope.crypto?.randomUUID === "function"
  );
}

function decodeOggOpus(Offline: typeof OfflineAudioContext, atobFn: (data: string) => string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), DECODE_TIMEOUT_MS);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      const bin = atobFn(OGG_OPUS_SAMPLE);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ctx = new Offline(1, 1, 48000);
      // Callback form as well as the promise: older WebKit only calls back, newer rejects too.
      const pending = ctx.decodeAudioData(bytes.buffer, () => finish(true), () => finish(false));
      pending?.catch?.(() => finish(false));
    } catch {
      finish(false);
    }
  });
}

/** The features this browser lacks, in a fixed order; empty when it can run the council. */
export async function findMissingFeatures(scope: SupportScope = globalThis): Promise<BrowserFeature[]> {
  const missing: BrowserFeature[] = [];
  if (!hasModernJs(scope)) missing.push("modern-js");
  if (typeof scope.WebSocket !== "function") missing.push("websocket");

  const Offline = scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext;
  if (typeof scope.AudioContext !== "function" || typeof Offline !== "function") {
    missing.push("webaudio");
  } else if (!(await decodeOggOpus(Offline, scope.atob.bind(scope)))) {
    missing.push("ogg-opus");
  }

  // Presence only: whether the visitor allows the mic is asked later, when they first talk.
  // mediaDevices is also absent outside a secure context (a dev server reached by LAN IP).
  if (typeof scope.navigator?.mediaDevices?.getUserMedia !== "function") missing.push("microphone");
  if (typeof scope.RTCPeerConnection !== "function") missing.push("webrtc");
  return missing;
}
