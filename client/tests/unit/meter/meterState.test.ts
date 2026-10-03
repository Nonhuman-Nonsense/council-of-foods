import { describe, expect, it } from "vitest";
import type { MeterUsageEvent } from "@shared/MeterTypes";
import { estimateGpuSeconds, estimateImpacts, findEcologitsModel } from "@shared/footprint/ecologits";
import { ROOM_POWER_SILENT_MS, type RoomPowerReading } from "@shared/MeterTypes";
import {
  activeModels,
  applyMeetingProgress,
  applyRoomPower,
  applyUsageEvent,
  countedOf,
  EMPTY_METER_STATE,
  footprintOf,
  formatRange,
  gpuTimeOf,
  guessedShareOf,
  playedRows,
  roomFootprintOf,
  toDisplayRange,
  type MeterState,
} from "@/meter/meterState";

const TS = "2026-09-16T12:00:00.000Z";

function usage(overrides: Partial<MeterUsageEvent> = {}): MeterUsageEvent {
  return {
    feature: "dialogue",
    provider: "inworld",
    model: "mistral/mistral-large-3",
    measures: { output_tokens: 100 },
    ts: TS,
    ...overrides,
  };
}

const row = (requests: number, output_tokens: number) => ({
  provider: "inworld",
  model: "mistral/mistral-large-3",
  requests,
  measures: { output_tokens },
  lastUsedAt: TS,
});

describe("meter state", () => {
  const atMeeting5: MeterState = {
    global: [row(1, 100)],
    venue: [row(1, 100)],
    venueName: "Museum Oslo",
    meeting: { meetingId: 5, maximumPlayedIndex: -1, totals: [row(1, 100)] },
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
      expected: { ...atMeeting5, global: [row(2, 200)], venue: [row(2, 200)], meeting: { meetingId: 5, maximumPlayedIndex: -1, totals: [row(2, 200)] } },
    },
    {
      name: "starts over when the venue begins a newer meeting",
      event: usage({ venueId: "museum-oslo", meetingId: 6 }),
      expected: { ...atMeeting5, global: [row(2, 200)], venue: [row(2, 200)], meeting: { meetingId: 6, maximumPlayedIndex: -1, totals: [row(1, 100)] } },
    },
    {
      name: "starts over, before the meeting exists, when a visitor's setup begins",
      event: usage({ venueId: "museum-oslo", feature: "setup-agent", setupId: "visit" }),
      expected: {
        ...atMeeting5,
        global: [row(2, 200)],
        venue: [row(2, 200)],
        meeting: { meetingId: null, setupId: "visit", previousMeetingId: 5, maximumPlayedIndex: -1, totals: [row(1, 100)] },
      },
    },
  ])("$name", ({ event, expected }) => {
    expect(applyUsageEvent(atMeeting5, event, "museum-oslo")).toEqual(expected);
  });

  it("adds a model it has not seen as a new row", () => {
    const state = applyUsageEvent(EMPTY_METER_STATE, usage({ model: "inworld-tts-1.5-max", measures: { audio_seconds: 3 } }), undefined);

    expect(state.global).toEqual([
      { provider: "inworld", model: "inworld-tts-1.5-max", requests: 1, measures: { audio_seconds: 3 }, lastUsedAt: TS },
    ]);
  });

  it("counts a meeting's messages once they have been played, and live usage at once", () => {
    const venue = "museum-oslo";
    let state: MeterState = { ...EMPTY_METER_STATE, meeting: { meetingId: 5, maximumPlayedIndex: 0, totals: [] } };
    state = applyUsageEvent(state, usage({ venueId: venue, meetingId: 5, messageIndex: 0, measures: { output_tokens: 10 } }), venue);
    state = applyUsageEvent(state, usage({ venueId: venue, meetingId: 5, messageIndex: 1, measures: { output_tokens: 20 } }), venue);
    state = applyUsageEvent(state, usage({ venueId: venue, meetingId: 5, measures: { output_tokens: 3 } }), venue);

    expect(countedOf(playedRows(state.meeting)).tokensWritten).toBe(13);

    state = applyMeetingProgress(state, { meetingId: 5, venueId: venue, maximumPlayedIndex: 1 }, venue);

    expect(countedOf(playedRows(state.meeting)).tokensWritten).toBe(33);
    expect(countedOf(state.venue).tokensWritten).toBe(33);
  });

  it("keeps a setup's usage in the meeting it leads to, and the previous meeting's out", () => {
    const venue = "museum-oslo";
    let state = applyUsageEvent(atMeeting5, usage({ venueId: venue, feature: "setup-agent", setupId: "visit", measures: { output_tokens: 7 } }), venue);
    state = applyUsageEvent(state, usage({ venueId: venue, meetingId: 5, messageIndex: 0 }), venue);
    state = applyMeetingProgress(state, { meetingId: 6, venueId: venue, maximumPlayedIndex: -1 }, venue);
    state = applyUsageEvent(state, usage({ venueId: venue, feature: "setup-agent", setupId: "visit", meetingId: 6, measures: { output_tokens: 1 } }), venue);

    expect(state.meeting).toMatchObject({ meetingId: 6, setupId: "visit" });
    expect(state.meeting).not.toHaveProperty("previousMeetingId");
    expect(countedOf(playedRows(state.meeting)).tokensWritten).toBe(8);
  });

  it.each([
    { name: "moves the current meeting on", progress: { meetingId: 5, venueId: "museum-oslo", maximumPlayedIndex: 4 }, expected: { meetingId: 5, maximumPlayedIndex: 4 } },
    { name: "never moves it back", progress: { meetingId: 5, venueId: "museum-oslo", maximumPlayedIndex: 1 }, expected: { meetingId: 5, maximumPlayedIndex: 2 } },
    { name: "ignores an older meeting", progress: { meetingId: 4, venueId: "museum-oslo", maximumPlayedIndex: 9 }, expected: { meetingId: 5, maximumPlayedIndex: 2 } },
    { name: "ignores another venue", progress: { meetingId: 7, venueId: "elsewhere", maximumPlayedIndex: 9 }, expected: { meetingId: 5, maximumPlayedIndex: 2 } },
    { name: "starts a newer meeting empty", progress: { meetingId: 6, venueId: "museum-oslo", maximumPlayedIndex: 0 }, expected: { meetingId: 6, maximumPlayedIndex: 0 } },
  ])("playback progress $name", ({ progress, expected }) => {
    const state: MeterState = { ...EMPTY_METER_STATE, meeting: { meetingId: 5, maximumPlayedIndex: 2, totals: [row(1, 1)] } };

    expect(applyMeetingProgress(state, progress, "museum-oslo").meeting).toMatchObject(expected);
  });

  it("lists models called in the last minute, most recent first, once each", () => {
    const now = Date.parse(TS);
    const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
    const rows = [
      { ...row(1, 10), messageIndex: 0, lastUsedAt: at(50) },
      { ...row(1, 10), messageIndex: 1, lastUsedAt: at(5) },
      { provider: "inworld", model: "inworld-tts-1.5-max", requests: 1, measures: {}, lastUsedAt: at(20) },
      { provider: "inworld", model: "soniox/stt-rt-v4", requests: 1, measures: {}, lastUsedAt: at(90) },
    ];

    expect(activeModels(rows, now).map((r) => [r.model, r.lastUsedAt])).toEqual([
      ["mistral/mistral-large-3", at(5)],
      ["inworld-tts-1.5-max", at(20)],
    ]);
  });

  it("sums the footprint of estimated models and leaves unknown ones out", () => {
    const mistral = findEcologitsModel("inworld", "mistral/mistral-large-3")!;

    const impacts = footprintOf([row(2, 400), { provider: "acme", model: "mystery-1", requests: 1, measures: { output_tokens: 5 }, lastUsedAt: TS }]);

    expect(impacts).toEqual(estimateImpacts(mistral, { measures: { output_tokens: 400 }, requests: 2 }));
  });
});

describe("what the meter derives from usage", () => {
  const speech = { provider: "inworld", model: "inworld-tts-1.5-max", requests: 4, measures: { characters: 900, audio_seconds: 50 }, lastUsedAt: TS };
  const listening = { provider: "inworld", model: "soniox/stt-rt-v4", requests: 2, measures: { audio_seconds: 12 }, lastUsedAt: TS };
  const classifier = { provider: "inworld", model: "google-ai-studio/gemini-2.5-flash", requests: 3, measures: { output_tokens: 12 }, lastUsedAt: TS };

  it("counts tokens written, seconds spoken and seconds listened, exactly", () => {
    expect(countedOf([row(5, 2000), classifier, speech, listening])).toEqual({
      tokensWritten: 2012,
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
