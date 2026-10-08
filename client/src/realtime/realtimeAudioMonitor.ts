/**
 * Watches the audio side of a realtime session: whether the agent's audio actually reaches
 * the page and plays, and whether the visitor's microphone is actually sending.
 *
 * Two jobs. It logs a sample of the connection's audio counters — every few seconds while
 * the agent is answering, once a minute otherwise, which doubles as a heartbeat showing the
 * session is still alive. And after each reply that carried audio it checks the audio was
 * heard, reporting a stall when it was not: "the model said nothing" and "the model spoke
 * but nobody heard it" look identical from in front of the screen.
 */

import type { StallReport } from "./realtimeStallDetector";

/** Sampling while the agent is answering, and for a while after. */
export const AUDIO_STATS_ACTIVE_MS = 5_000;
/** Sampling while nothing is happening: a heartbeat. */
export const AUDIO_STATS_IDLE_MS = 60_000;
/** How long sampling stays fast after a reply finishes — its audio is still playing. */
const ACTIVE_AFTER_DONE_MS = 15_000;
/** Wait after a reply finishes before checking that its audio arrived. */
export const AUDIO_CHECK_DELAY_MS = 3_000;

/** Cumulative counters from `RTCPeerConnection.getStats()`; null where the browser has none. */
export type AudioStatsSample = {
  inPackets: number | null;
  inLost: number | null;
  /** Sum of the received audio's energy: rises only when there is sound. */
  inEnergy: number | null;
  outBytes: number | null;
};

export type AudioPlayback = {
  elementPaused: boolean | null;
  /** Deliberately muted by the app — silence is expected. */
  elementMuted: boolean;
  /** The browser refused `play()` and nothing has retried it successfully yet. */
  blocked: boolean;
  contextState: string | null;
};

export type AudioProbe = {
  readStats: () => Promise<AudioStatsSample | null>;
  playback: () => AudioPlayback;
  /** Connection states, for the heartbeat. */
  connection: () => Record<string, string | null>;
};

export type AudioMonitor = {
  observeIncoming: (event: unknown) => void;
  dispose: () => void;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Read the audio counters off a peer connection. Never throws. */
export async function readPeerAudioStats(pc: RTCPeerConnection | null | undefined): Promise<AudioStatsSample | null> {
  if (!pc || typeof pc.getStats !== "function") return null;
  try {
    const report = await pc.getStats();
    let inbound: Record<string, unknown> | null = null;
    let outbound: Record<string, unknown> | null = null;
    report.forEach((stat: Record<string, unknown>) => {
      if (stat.kind !== "audio") return;
      if (stat.type === "inbound-rtp") inbound = stat;
      if (stat.type === "outbound-rtp") outbound = stat;
    });
    const inStat = inbound as Record<string, unknown> | null;
    const outStat = outbound as Record<string, unknown> | null;
    return {
      inPackets: num(inStat?.packetsReceived),
      inLost: num(inStat?.packetsLost),
      inEnergy: num(inStat?.totalAudioEnergy),
      outBytes: num(outStat?.bytesSent),
    };
  } catch {
    return null;
  }
}

function delta(now: number | null, before: number | null | undefined): number | null {
  if (now == null || before == null) return null;
  return now - before;
}

function asObj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function createAudioMonitor(params: {
  probe: AudioProbe;
  log: (message: string, data: Record<string, unknown>) => void;
  onStall: (report: StallReport) => void;
}): AudioMonitor {
  const { probe, log, onStall } = params;
  let disposed = false;
  let activeUntil = 0;
  let lastLoggedAt = 0;
  let lastSample: AudioStatsSample | null = null;
  /** Counters when the current reply began, to tell whether its audio arrived. */
  let atResponseStart: Promise<AudioStatsSample | null> | null = null;
  let audioDeltas = 0;
  const checks = new Set<ReturnType<typeof setTimeout>>();

  const sample = async (): Promise<void> => {
    const now = Date.now();
    const active = now < activeUntil;
    if (!active && now - lastLoggedAt < AUDIO_STATS_IDLE_MS) return;
    lastLoggedAt = now;
    const stats = await probe.readStats();
    if (disposed) return;
    const before = lastSample;
    lastSample = stats;
    log("audio stats", {
      active,
      inPackets: delta(stats?.inPackets ?? null, before?.inPackets),
      inLost: delta(stats?.inLost ?? null, before?.inLost),
      inEnergy: roundEnergy(delta(stats?.inEnergy ?? null, before?.inEnergy)),
      outBytes: delta(stats?.outBytes ?? null, before?.outBytes),
      ...probe.playback(),
      ...probe.connection(),
    });
  };

  const interval = setInterval(() => {
    void sample();
  }, AUDIO_STATS_ACTIVE_MS);

  const checkHeard = (responseId: string | null, startPromise: Promise<AudioStatsSample | null> | null) => {
    const timer = setTimeout(() => {
      checks.delete(timer);
      void (async () => {
        if (disposed) return;
        const playback = probe.playback();
        if (playback.elementMuted) return;
        if (playback.blocked || playback.elementPaused === true) {
          onStall({ rule: "audio-blocked", detail: { responseId, ...playback } });
          return;
        }
        const [start, end] = await Promise.all([startPromise, probe.readStats()]);
        if (disposed) return;
        const energy = delta(end?.inEnergy ?? null, start?.inEnergy);
        const packets = delta(end?.inPackets ?? null, start?.inPackets);
        // Only a measured zero counts: a browser that reports no energy proves nothing.
        if (energy != null && energy <= 0) {
          onStall({ rule: "audio-not-received", detail: { responseId, inEnergy: energy, inPackets: packets, ...playback } });
        }
      })();
    }, AUDIO_CHECK_DELAY_MS);
    checks.add(timer);
  };

  const observeIncoming = (event: unknown): void => {
    const obj = asObj(event);
    const type = obj?.type;
    if (type === "response.created") {
      activeUntil = Number.POSITIVE_INFINITY;
      audioDeltas = 0;
      atResponseStart = probe.readStats();
    } else if (type === "response.output_audio.delta") {
      audioDeltas += 1;
    } else if (type === "response.done") {
      activeUntil = Date.now() + ACTIVE_AFTER_DONE_MS;
      const response = asObj(obj?.response);
      if (response?.status === "completed" && audioDeltas > 0) {
        checkHeard(typeof response.id === "string" ? response.id : null, atResponseStart);
      }
      atResponseStart = null;
    }
  };

  const dispose = (): void => {
    disposed = true;
    clearInterval(interval);
    for (const timer of checks) clearTimeout(timer);
    checks.clear();
  };

  return { observeIncoming, dispose };
}

function roundEnergy(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10_000) / 10_000;
}
