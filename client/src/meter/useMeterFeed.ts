import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  METER_NAMESPACE,
  METER_PROGRESS_EVENT,
  METER_ROOM_POWER_EVENT,
  METER_USAGE_EVENT,
  type MeetingProgress,
  type MeterSnapshot,
  type MeterUsageEvent,
  type RoomPowerReading,
} from "@shared/MeterTypes";
import { applyMeetingProgress, applyRoomPower, applyUsageEvent, EMPTY_METER_STATE, type MeterState } from "./meterState";

/**
 * Live usage for the meter: a snapshot over HTTP whenever the socket (re)connects, then every
 * pushed usage event on top. Refetching on reconnect means a dropped connection costs at most
 * a moment of stale numbers, never a permanent gap.
 */
export function useMeterFeed(venueId: string | undefined, demo: boolean): MeterState {
  const [state, setState] = useState<MeterState>(EMPTY_METER_STATE);

  useEffect(() => {
    if (demo) return startDemoFeed(venueId ?? DEMO_VENUE, setState);

    let cancelled = false;
    const socket = io(METER_NAMESPACE);

    const loadSnapshot = async () => {
      try {
        const query = venueId ? `?venue=${encodeURIComponent(venueId)}` : "";
        const res = await fetch(`/api/meter${query}`);
        if (!res.ok) return;
        const snapshot = (await res.json()) as MeterSnapshot;
        if (!cancelled) setState(snapshot);
      } catch {
        // The next reconnect tries again.
      }
    };

    socket.on("connect", loadSnapshot);
    socket.on(METER_USAGE_EVENT, (event: MeterUsageEvent) => {
      setState((current) => applyUsageEvent(current, event, venueId));
    });
    socket.on(METER_ROOM_POWER_EVENT, (reading: RoomPowerReading) => {
      setState((current) => applyRoomPower(current, reading, venueId));
    });
    socket.on(METER_PROGRESS_EVENT, (progress: MeetingProgress) => {
      setState((current) => applyMeetingProgress(current, progress, venueId));
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [venueId, demo]);

  return state;
}

// --- TEMPORARY demo feed (?demo) -------------------------------------------------------
// Fakes a meeting so the screen can be judged without a live council. Remove once the
// meter has been tuned on the real display.

const DEMO_VENUE = "demo";
const DEMO_INTERVAL_MS = 2500;

/** One council turn: the reply, its voice and its routing, all for one message. */
const DEMO_TURN: Pick<MeterUsageEvent, "feature" | "provider" | "model" | "measures">[] = [
  { feature: "dialogue", provider: "inworld", model: "mistral/mistral-large-3", measures: { input_tokens: 2800, output_tokens: 220 } },
  { feature: "classifier", provider: "inworld", model: "google-ai-studio/gemini-2.5-flash", measures: { input_tokens: 900, output_tokens: 4 } },
  { feature: "tts", provider: "inworld", model: "inworld-tts-1.5-max", measures: { characters: 480, audio_seconds: 24 } },
];

/** Live usage with no message: the meta agent listening to a visitor. */
const DEMO_LISTENING: Pick<MeterUsageEvent, "feature" | "provider" | "model" | "measures"> = {
  feature: "meta-agent", provider: "inworld", model: "soniox/stt-rt-v4", measures: { audio_seconds: 6 },
};

const DEMO_PLUGS = [
  { plug: 1, label: "Projector", watts: 244 },
  { plug: 2, label: "Computer & meter screen", watts: 38 },
  { plug: 3, label: "Sound", watts: 22 },
];

/** Replies are generated this many messages ahead of what has been played, like the council. */
const DEMO_AHEAD = 2;

function startDemoFeed(venueId: string, setState: (update: (s: MeterState) => MeterState) => void): () => void {
  let tick = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const hours = (Date.now() - startedAt) / 3_600_000;
    for (const plug of DEMO_PLUGS) {
      const reading: RoomPowerReading = {
        ...plug,
        venueId,
        watts: plug.watts * (0.95 + Math.random() * 0.1),
        energyWh: plug.watts * hours,
        updatedAt: new Date().toISOString(),
      };
      setState((current) => applyRoomPower(current, reading, venueId));
    }
    const ts = new Date().toISOString();
    const usage = (call: Pick<MeterUsageEvent, "feature" | "provider" | "model" | "measures">, messageIndex?: number): MeterUsageEvent => ({
      ...call,
      venueId,
      meetingId: 1,
      ...(messageIndex !== undefined ? { messageIndex } : {}),
      ts,
    });
    // Each tick writes the next message and plays the one DEMO_AHEAD behind it.
    const message = tick;
    for (const call of DEMO_TURN) {
      setState((current) => applyUsageEvent(current, usage(call, message), venueId));
    }
    if (tick % 3 === 2) {
      setState((current) => applyUsageEvent(current, usage(DEMO_LISTENING), venueId));
    }
    setState((current) => applyMeetingProgress(current, { meetingId: 1, venueId, maximumPlayedIndex: message - DEMO_AHEAD }, venueId));
    tick++;
  }, DEMO_INTERVAL_MS);
  return () => clearInterval(timer);
}
