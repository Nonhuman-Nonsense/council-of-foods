import { describe, expect, it } from "vitest";
import type { MeterUsageEvent } from "@shared/MeterTypes";
import { estimateGpuSeconds, estimateImpacts, findEcologitsModel } from "@shared/footprint/ecologits";
import { ROOM_POWER_SILENT_MS, type RoomPowerReading } from "@shared/MeterTypes";
import {
  applyRoomPower,
  applyUsageEvent,
  countedOf,
  EMPTY_METER_STATE,
  footprintOf,
  formatRange,
  gpuTimeOf,
  guessedShareOf,
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

describe("what the meter derives from usage", () => {
  const speech = { provider: "inworld", model: "inworld-tts-1.5-max", requests: 4, measures: { characters: 900, audio_seconds: 50 } };
  const listening = { provider: "inworld", model: "soniox/stt-rt-v4", requests: 2, measures: { audio_seconds: 12 } };
  const classifier = { provider: "inworld", model: "google-ai-studio/gemini-2.5-flash", requests: 3, measures: { output_tokens: 12 } };

  it("counts replies written, seconds spoken and seconds listened, exactly", () => {
    expect(countedOf([row(5, 2000), classifier, speech, listening])).toEqual({
      replies: 8,
      spokenSeconds: 50,
      listenedSeconds: 12,
    });
  });

  it.each([
    { name: "none of it when only described models ran", rows: [row(2, 400)], expected: { low: 0, high: 0 } },
    { name: "all of it when only guessed models ran", rows: [speech], expected: { low: 1, high: 1 } },
  ])("says $name rests on guesses", ({ rows, expected }) => {
    expect(guessedShareOf(rows)).toEqual(expected);
  });

  it("puts a share of the energy on guesses when both kinds ran", () => {
    const share = guessedShareOf([row(2, 400), speech])!;

    expect(share.low).toBeGreaterThan(0);
    expect(share.high).toBeLessThan(1);
    expect(share.low).toBeLessThanOrEqual(share.high);
  });

  it("has no guessed share before anything ran", () => {
    expect(guessedShareOf([])).toBeNull();
  });

  it("adds up the GPU time of every model that ran", () => {
    const mistral = findEcologitsModel("inworld", "mistral/mistral-large-3")!;
    const tts = findEcologitsModel("inworld", "inworld-tts-1.5-max")!;
    const a = estimateGpuSeconds(mistral, { measures: { output_tokens: 400 }, requests: 2 });
    const b = estimateGpuSeconds(tts, { measures: speech.measures, requests: 4 });

    expect(gpuTimeOf([row(2, 400), speech])).toEqual({ low: a.low + b.low, high: a.high + b.high });
  });
});

describe("display ranges", () => {
  it.each([
    { quantity: "energy", range: { low: 0.0002, high: 0.0004 }, unit: "Wh" },
    { quantity: "energy", range: { low: 0.4, high: 3 }, unit: "kWh" },
    { quantity: "wcf", range: { low: 0.0000001, high: 0.0000003 }, unit: "mL" },
    { quantity: "gpuTime", range: { low: 30, high: 150 }, unit: "GPU-minutes" },
  ] as const)("shows $range.low–$range.high $quantity in $unit, by its high end", ({ quantity, range, unit }) => {
    expect(toDisplayRange(quantity, range).unit).toBe(unit);
  });

  it.each([
    { range: { low: 0.6123, high: 1.2345, unit: "Wh" }, text: "0.61–1.2 Wh" },
    { range: { low: 45, high: 45, unit: "mL" }, text: "45 mL" },
    { range: { low: 20_400, high: 20_400, unit: "t CO₂e" }, text: "20,000 t CO₂e" },
    { range: { low: 0.0261, high: 0.0263, unit: "g CO₂e" }, text: "0.026 g CO₂e" },
  ])("writes an estimate as $text, with two significant figures", ({ range, text }) => {
    expect(formatRange(range)).toBe(text);
  });

  it("keeps a published figure's third significant figure", () => {
    expect(formatRange({ low: 20_400, high: 20_400, unit: "t CO₂e" }, 3)).toBe("20,400 t CO₂e");
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
