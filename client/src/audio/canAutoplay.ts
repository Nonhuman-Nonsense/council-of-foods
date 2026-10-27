import { useEffect, useState } from "react";
import { log } from "@/logger";

/**
 * Can this page start audible audio right now, without the visitor doing
 * anything first?
 *
 * Every major browser says no on a cold visit — Chrome, Firefox and Safari all
 * require a gesture on the origin (Chrome also accepts a high Media Engagement
 * Index, Firefox also accepts a granted microphone). A voice agent that starts
 * talking into a blocked audio element loses what it said and bills for the
 * privilege, so we ask before connecting one.
 *
 * Asking, rather than inferring from mic permission or which page we are on:
 * only Firefox treats mic permission as consent to autoplay, and no heuristic
 * of ours can see Chrome's engagement score.
 */

/**
 * 50 ms of silence, assembled here rather than pasted in as base64.
 *
 * The pasted version lost a single padding character and became undecodable,
 * which turned every probe into a confident "blocked" — the agent then never
 * started on its own in any browser. Bytes we build are bytes we can check.
 */
export function buildSilentWavBytes(): ArrayBuffer {
  const sampleRate = 8000;
  const samples = 400;
  const dataBytes = samples * 2; // 16-bit mono, already zero-filled = silence
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  return buffer;
}

function createSilentWavUrl(): string {
  return URL.createObjectURL(new Blob([buildSilentWavBytes()], { type: "audio/wav" }));
}

/** Cached across calls: the answer only changes when the visitor interacts. */
let cached: boolean | null = null;

/**
 * Resolves true when audible playback would start without a gesture. Three
 * independent answers, cheapest and most certain first; never throws, and an
 * unanswerable question is answered "no" — which costs a visitor the automatic
 * greeting, not the agent.
 */
export async function canAutoplayAudio(): Promise<boolean> {
  // 1. Firefox 112+ answers directly. No other engine has shipped this.
  const policyFor = navigator.getAutoplayPolicy?.bind(navigator);
  if (policyFor) {
    try {
      if (policyFor("mediaelement") === "allowed") return true;
    } catch {
      // Fall through.
    }
  }

  // 2. Any interaction with the page satisfies every browser's gesture rule,
  //    and this reports it without touching the audio stack.
  if (navigator.userActivation?.hasBeenActive) return true;

  // 3. Cold, with no help from the above: ask by trying. Catches Chrome's
  //    media engagement score and Safari's per-site "allow", which nothing
  //    else exposes.
  const url = createSilentWavUrl();
  try {
    const probe = new Audio(url);
    // Unmuted on purpose: muted playback is always permitted, so a muted probe
    // would cheerfully answer a question nobody asked.
    probe.muted = false;
    probe.volume = 1;
    await probe.play();
    probe.pause();
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Whether audible playback is allowed, re-checked when the visitor first
 * interacts with the page.
 *
 * The gesture is taken at face value rather than re-probed: a click or key
 * press is exactly the condition Chrome, Firefox and Safari all require, and
 * probing at that moment raced the browser's own bookkeeping.
 */
export function useAutoplayAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let settled = false;

    const allow = (reason: string) => {
      if (settled) return;
      settled = true;
      cached = true;
      log.event("REALTIME", "audible autoplay allowed", { reason });
      setAllowed(true);
    };

    if (cached) {
      allow("cached");
    } else {
      void canAutoplayAudio().then((result) => {
        if (result) allow("probe");
      });
    }

    const onGesture = () => allow("gesture");
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchend", onGesture);

    return () => {
      settled = true;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchend", onGesture);
    };
  }, []);

  return allowed;
}

/** Test seam: forget what the browser last told us. */
export function resetAutoplayCacheForTests(): void {
  cached = null;
}
