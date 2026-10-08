import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_CHECK_DELAY_MS,
  AUDIO_STATS_ACTIVE_MS,
  AUDIO_STATS_IDLE_MS,
  createAudioMonitor,
  type AudioPlayback,
  type AudioStatsSample,
} from "@realtime/realtimeAudioMonitor";
import type { StallReport } from "@realtime/realtimeStallDetector";

const PLAYING: AudioPlayback = { elementPaused: false, elementMuted: false, blocked: false, contextState: "running" };

function stats(inEnergy: number | null): AudioStatsSample {
  return { inPackets: 100, inLost: 0, inEnergy, outBytes: 0 };
}

describe("createAudioMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(params: { energyBefore: number | null; energyAfter: number | null; playback?: AudioPlayback }) {
    const reports: StallReport[] = [];
    const lines: Array<[string, Record<string, unknown>]> = [];
    const readStats = vi
      .fn<() => Promise<AudioStatsSample | null>>()
      .mockResolvedValueOnce(stats(params.energyBefore))
      .mockResolvedValue(stats(params.energyAfter));
    const monitor = createAudioMonitor({
      probe: {
        readStats,
        playback: () => params.playback ?? PLAYING,
        connection: () => ({ pc: "connected", ice: "connected", dc: "open" }),
      },
      log: (message, data) => lines.push([message, data]),
      onStall: (report) => reports.push(report),
    });
    return { monitor, reports, lines };
  }

  /** "The model said nothing" and "nobody heard it" look the same in the room. */
  it.each([
    { name: "audio that arrived and played", energyAfter: 0.8, playback: PLAYING, stall: null },
    { name: "audio that never arrived", energyAfter: 0.2, playback: PLAYING, stall: "audio-not-received" },
    { name: "audio the browser will not play", energyAfter: 0.8, playback: { ...PLAYING, blocked: true }, stall: "audio-blocked" },
    { name: "a paused audio element", energyAfter: 0.8, playback: { ...PLAYING, elementPaused: true }, stall: "audio-blocked" },
    { name: "an agent muted on purpose", energyAfter: 0.2, playback: { ...PLAYING, elementMuted: true }, stall: null },
  ])("$name → $stall", async ({ energyAfter, playback, stall }) => {
    const { monitor, reports } = setup({ energyBefore: 0.2, energyAfter, playback });

    monitor.observeIncoming({ type: "response.created", response: { id: "r1" } });
    monitor.observeIncoming({ type: "response.output_audio.delta", response_id: "r1" });
    monitor.observeIncoming({ type: "response.done", response: { id: "r1", status: "completed" } });
    await vi.advanceTimersByTimeAsync(AUDIO_CHECK_DELAY_MS);
    monitor.dispose();

    expect(reports.map((report) => report.rule)).toEqual(stall ? [stall] : []);
  });

  it("does not check a reply that carried no audio", async () => {
    const { monitor, reports } = setup({ energyBefore: 0.2, energyAfter: 0.2 });

    monitor.observeIncoming({ type: "response.created", response: { id: "r1" } });
    monitor.observeIncoming({ type: "response.done", response: { id: "r1", status: "completed" } });
    await vi.advanceTimersByTimeAsync(AUDIO_CHECK_DELAY_MS);
    monitor.dispose();

    expect(reports).toEqual([]);
  });

  it("does not blame a browser that reports no audio energy", async () => {
    const { monitor, reports } = setup({ energyBefore: null, energyAfter: null });

    monitor.observeIncoming({ type: "response.created", response: { id: "r1" } });
    monitor.observeIncoming({ type: "response.output_audio.delta", response_id: "r1" });
    monitor.observeIncoming({ type: "response.done", response: { id: "r1", status: "completed" } });
    await vi.advanceTimersByTimeAsync(AUDIO_CHECK_DELAY_MS);
    monitor.dispose();

    expect(reports).toEqual([]);
  });

  it("samples often while the agent answers and once a minute otherwise", async () => {
    const { monitor, lines } = setup({ energyBefore: 0, energyAfter: 0 });

    await vi.advanceTimersByTimeAsync(AUDIO_STATS_IDLE_MS);
    const idleSamples = lines.length;
    monitor.observeIncoming({ type: "response.created", response: { id: "r1" } });
    await vi.advanceTimersByTimeAsync(4 * AUDIO_STATS_ACTIVE_MS);
    monitor.dispose();

    expect(idleSamples).toBe(1);
    expect(lines.length - idleSamples).toBe(4);
    expect(lines[0][0]).toBe("audio stats");
    expect(lines[0][1]).toMatchObject({ pc: "connected", dc: "open", blocked: false });
  });
});
