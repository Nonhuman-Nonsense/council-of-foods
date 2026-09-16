import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  METER_NAMESPACE,
  METER_ROOM_POWER_EVENT,
  METER_USAGE_EVENT,
  type MeterSnapshot,
  type MeterUsageEvent,
  type RoomPowerReading,
} from "@shared/MeterTypes";
import { applyRoomPower, applyUsageEvent, EMPTY_METER_STATE, type MeterState } from "./meterState";

/**
 * Live usage for the meter: a snapshot over HTTP whenever the socket (re)connects, then every
 * pushed usage event on top. Refetching on reconnect means a dropped connection costs at most
 * a moment of stale numbers, never a permanent gap.
 */
export function useMeterFeed(installationId: string | undefined, demo: boolean): MeterState {
  const [state, setState] = useState<MeterState>(EMPTY_METER_STATE);

  useEffect(() => {
    if (demo) return startDemoFeed(installationId ?? DEMO_INSTALLATION, setState);

    let cancelled = false;
    const socket = io(METER_NAMESPACE);

    const loadSnapshot = async () => {
      try {
        const query = installationId ? `?installation=${encodeURIComponent(installationId)}` : "";
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
      setState((current) => applyUsageEvent(current, event, installationId));
    });
    socket.on(METER_ROOM_POWER_EVENT, (reading: RoomPowerReading) => {
      setState((current) => applyRoomPower(current, reading, installationId));
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [installationId, demo]);

  return state;
}

// --- TEMPORARY demo feed (?demo) -------------------------------------------------------
// Fakes a meeting so the screen can be judged without a live council. Remove once the
// meter has been tuned on the real display.

const DEMO_INSTALLATION = "demo";
const DEMO_INTERVAL_MS = 2500;

const DEMO_CALLS: Pick<MeterUsageEvent, "feature" | "provider" | "model" | "measures">[] = [
  { feature: "dialogue", provider: "inworld", model: "mistral/mistral-large-3", measures: { input_tokens: 2800, output_tokens: 220 } },
  { feature: "tts", provider: "inworld", model: "inworld-tts-1.5-max", measures: { characters: 480, audio_seconds: 24 } },
  { feature: "classifier", provider: "inworld", model: "google-ai-studio/gemini-2.5-flash", measures: { input_tokens: 900, output_tokens: 4 } },
  { feature: "meta-agent", provider: "inworld", model: "soniox/stt-rt-v4", measures: { audio_seconds: 6 } },
];

const DEMO_PLUGS = [
  { deviceId: "demo-projector", label: "Projector", watts: 244 },
  { deviceId: "demo-computer", label: "Computer & meter screen", watts: 38 },
  { deviceId: "demo-sound", label: "Sound", watts: 22 },
];

function startDemoFeed(installationId: string, setState: (update: (s: MeterState) => MeterState) => void): () => void {
  let call = 0;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const hours = (Date.now() - startedAt) / 3_600_000;
    for (const plug of DEMO_PLUGS) {
      const reading: RoomPowerReading = {
        ...plug,
        installationId,
        watts: plug.watts * (0.95 + Math.random() * 0.1),
        energyWh: plug.watts * hours,
        updatedAt: new Date().toISOString(),
      };
      setState((current) => applyRoomPower(current, reading, installationId));
    }
    const event: MeterUsageEvent = {
      ...DEMO_CALLS[call % DEMO_CALLS.length],
      source: "server",
      installationId,
      meetingId: 1,
      ts: new Date().toISOString(),
    };
    call++;
    setState((current) => applyUsageEvent(current, event, installationId));
  }, DEMO_INTERVAL_MS);
  return () => clearInterval(timer);
}
