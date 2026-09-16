import { describe, expect, it } from "vitest";
import type { MeterUsageEvent } from "@shared/MeterTypes";
import { estimateImpacts, findEcologitsModel } from "@shared/footprint/ecologits";
import type { RoomPowerReading } from "@shared/MeterTypes";
import {
  applyRoomPower,
  applyUsageEvent,
  EMPTY_METER_STATE,
  footprintOf,
  ROOM_POWER_STALE_MS,
  roomFootprintOf,
  toDisplayRange,
  type MeterState,
} from "@/meter/meterState";

function usage(overrides: Partial<MeterUsageEvent> = {}): MeterUsageEvent {
  return {
    source: "server",
    feature: "dialogue",
    provider: "inworld",
    model: "mistral/mistral-large-3",
    measures: { output_tokens: 100 },
    ts: "2026-09-16T12:00:00.000Z",
    ...overrides,
  };
}

const row = (requests: number, output_tokens: number) => ({
  provider: "inworld",
  model: "mistral/mistral-large-3",
  requests,
  measures: { output_tokens },
});

describe("meter state", () => {
  const atMeeting5: MeterState = {
    global: [row(1, 100)],
    installation: [row(1, 100)],
    meeting: { meetingId: 5, totals: [row(1, 100)] },
    room: [],
  };

  it.each([
    {
      name: "counts another installation's usage only globally",
      event: usage({ installationId: "elsewhere", meetingId: 9 }),
      expected: { ...atMeeting5, global: [row(2, 200)] },
    },
    {
      name: "adds usage of the current meeting to every scope",
      event: usage({ installationId: "museum-oslo", meetingId: 5 }),
      expected: { global: [row(2, 200)], installation: [row(2, 200)], meeting: { meetingId: 5, totals: [row(2, 200)] }, room: [] },
    },
    {
      name: "starts over when the installation begins a newer meeting",
      event: usage({ installationId: "museum-oslo", meetingId: 6 }),
      expected: { global: [row(2, 200)], installation: [row(2, 200)], meeting: { meetingId: 6, totals: [row(1, 100)] }, room: [] },
    },
    {
      name: "keeps setup usage without a meeting out of the meeting",
      event: usage({ installationId: "museum-oslo", feature: "setup-agent" }),
      expected: { ...atMeeting5, global: [row(2, 200)], installation: [row(2, 200)] },
    },
  ])("$name", ({ event, expected }) => {
    expect(applyUsageEvent(atMeeting5, event, "museum-oslo")).toEqual(expected);
  });

  it("adds a model it has not seen as a new row", () => {
    const state = applyUsageEvent(EMPTY_METER_STATE, usage({ model: "inworld-tts-1.5-max", measures: { audio_seconds: 3 } }), undefined);

    expect(state.global).toEqual([{ provider: "inworld", model: "inworld-tts-1.5-max", requests: 1, measures: { audio_seconds: 3 } }]);
  });

  it("sums the footprint of estimated models and names the rest", () => {
    const mistral = findEcologitsModel("inworld", "mistral/mistral-large-3")!;

    const footprint = footprintOf([row(2, 400), { provider: "acme", model: "mystery-1", requests: 1, measures: { output_tokens: 5 } }]);

    expect(footprint.impacts).toEqual(estimateImpacts(mistral, { measures: { output_tokens: 400 }, requests: 2 }));
    expect(footprint.requests).toBe(3);
    expect(footprint.unestimatedModels).toEqual(["mystery-1"]);
  });
});

describe("toDisplayRange", () => {
  it.each([
    { impact: "energy", range: { low: 0.0002, high: 0.0004 }, expected: { central: 0.3, unit: "Wh" } },
    { impact: "energy", range: { low: 2, high: 4 }, expected: { central: 3, unit: "kWh" } },
    { impact: "wcf", range: { low: 0.0000001, high: 0.0000003 }, expected: { central: 0.0002, unit: "mL" } },
    { impact: "adpe", range: { low: 1e-9, high: 3e-9 }, expected: { central: 2, unit: "µg Sb eq" } },
  ] as const)("shows $range.low–$range.high $impact in $expected.unit", ({ impact, range, expected }) => {
    const display = toDisplayRange(impact, range);

    expect(display.unit).toBe(expected.unit);
    expect(display.central).toBeCloseTo(expected.central, 10);
  });
});

describe("room power", () => {
  const NOW = Date.parse("2026-09-20T12:00:00.000Z");

  function plug(overrides: Partial<RoomPowerReading> = {}): RoomPowerReading {
    return {
      installationId: "museum-oslo",
      deviceId: "projector",
      label: "Projector",
      watts: 244,
      energyWh: 500,
      updatedAt: new Date(NOW).toISOString(),
      ...overrides,
    };
  }

  it("keeps the latest reading per plug of this installation only", () => {
    let state = applyRoomPower(EMPTY_METER_STATE, plug(), "museum-oslo");
    state = applyRoomPower(state, plug({ watts: 250 }), "museum-oslo");
    state = applyRoomPower(state, plug({ deviceId: "sound", label: "Sound", watts: 20 }), "museum-oslo");
    state = applyRoomPower(state, plug({ installationId: "elsewhere", deviceId: "other" }), "museum-oslo");

    expect(state.room.map((r) => [r.label, r.watts])).toEqual([["Projector", 250], ["Sound", 20]]);
  });

  it("sums the room, leaving a silent plug's watts out but keeping its energy", () => {
    const silentSince = new Date(NOW - ROOM_POWER_STALE_MS - 1).toISOString();

    const room = roomFootprintOf([plug(), plug({ deviceId: "sound", watts: 20, energyWh: 40, updatedAt: silentSince })], NOW);

    expect(room.watts).toBe(244);
    expect(room.energyWh).toBe(540);
    expect(room.plugs.map((p) => p.silent)).toEqual([false, true]);
  });
});
