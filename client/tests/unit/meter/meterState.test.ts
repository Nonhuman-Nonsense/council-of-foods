import { describe, expect, it } from "vitest";
import type { MeterUsageEvent } from "@shared/MeterTypes";
import { estimateImpacts, findEcologitsModel } from "@shared/footprint/ecologits";
import { ROOM_POWER_SILENT_MS, type RoomPowerReading } from "@shared/MeterTypes";
import {
  applyRoomPower,
  applyUsageEvent,
  EMPTY_METER_STATE,
  footprintOf,
  roomFootprintOf,
  toDisplayRange,
  type MeterState,
} from "@/meter/meterState";

function usage(overrides: Partial<MeterUsageEvent> = {}): MeterUsageEvent {
  return {
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
    venue: [row(1, 100)],
    venueName: "Museum Oslo",
    meeting: { meetingId: 5, totals: [row(1, 100)] },
    room: [],
  };

  it.each([
    {
      name: "counts another venue's usage only globally",
      event: usage({ venueId: "elsewhere", meetingId: 9 }),
      expected: { ...atMeeting5, global: [row(2, 200)] },
    },
    {
      name: "adds usage of the current meeting to every scope",
      event: usage({ venueId: "museum-oslo", meetingId: 5 }),
      expected: { ...atMeeting5, global: [row(2, 200)], venue: [row(2, 200)], meeting: { meetingId: 5, totals: [row(2, 200)] } },
    },
    {
      name: "starts over when the venue begins a newer meeting",
      event: usage({ venueId: "museum-oslo", meetingId: 6 }),
      expected: { ...atMeeting5, global: [row(2, 200)], venue: [row(2, 200)], meeting: { meetingId: 6, totals: [row(1, 100)] } },
    },
    {
      name: "keeps setup usage without a meeting out of the meeting",
      event: usage({ venueId: "museum-oslo", feature: "setup-agent" }),
      expected: { ...atMeeting5, global: [row(2, 200)], venue: [row(2, 200)] },
    },
  ])("$name", ({ event, expected }) => {
    expect(applyUsageEvent(atMeeting5, event, "museum-oslo")).toEqual(expected);
  });

  it("adds a model it has not seen as a new row", () => {
    const state = applyUsageEvent(EMPTY_METER_STATE, usage({ model: "inworld-tts-1.5-max", measures: { audio_seconds: 3 } }), undefined);

    expect(state.global).toEqual([{ provider: "inworld", model: "inworld-tts-1.5-max", requests: 1, measures: { audio_seconds: 3 } }]);
  });

  it("sums the footprint of estimated models and leaves unknown ones out", () => {
    const mistral = findEcologitsModel("inworld", "mistral/mistral-large-3")!;

    const impacts = footprintOf([row(2, 400), { provider: "acme", model: "mystery-1", requests: 1, measures: { output_tokens: 5 } }]);

    expect(impacts).toEqual(estimateImpacts(mistral, { measures: { output_tokens: 400 }, requests: 2 }));
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
      venueId: "museum-oslo",
      plug: 1,
      label: "Projector",
      watts: 244,
      energyWh: 500,
      updatedAt: new Date(NOW).toISOString(),
      ...overrides,
    };
  }

  it("keeps the latest reading per plug at this venue only", () => {
    let state = applyRoomPower(EMPTY_METER_STATE, plug(), "museum-oslo");
    state = applyRoomPower(state, plug({ watts: 250 }), "museum-oslo");
    state = applyRoomPower(state, plug({ plug: 2, label: "Sound", watts: 20 }), "museum-oslo");
    state = applyRoomPower(state, plug({ venueId: "elsewhere", plug: 3 }), "museum-oslo");

    expect(state.room.map((r) => [r.label, r.watts])).toEqual([["Projector", 250], ["Sound", 20]]);
  });

  it("sums the room, leaving a silent plug off the list and out of the watts but keeping its energy", () => {
    const silentSince = new Date(NOW - ROOM_POWER_SILENT_MS - 1).toISOString();

    const room = roomFootprintOf([plug(), plug({ plug: 2, watts: 20, energyWh: 40, updatedAt: silentSince })], NOW);

    expect(room.watts).toBe(244);
    expect(room.energyWh).toBe(540);
    expect(room.plugs.map((p) => p.plug)).toEqual([1]);
  });
});
