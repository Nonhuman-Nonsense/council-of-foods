import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPowerButtonPress, PowerButtonShutdown, type OpenLogStream } from "../src/powerButton.js";

/** A `log stream --style ndjson` line, as macOS 27 writes it for the power button. */
function logLine(eventMessage: string): string {
  return JSON.stringify({
    eventType: "logEvent",
    senderImagePath: "/System/Library/Extensions/AppleSMC.kext/Contents/MacOS/AppleSMC",
    processImagePath: "/kernel",
    eventMessage,
  });
}

const PRESS = logLine("AppleSMCPMU::_smcNotifyCallout(): HID buttonIndex=1 buttonState=1 notification");
const RELEASE = logLine("AppleSMCPMU::_smcNotifyCallout(): HID buttonIndex=1 buttonState=0 notification");

describe("power button log lines", () => {
  it.each([
    { name: "a press", line: PRESS, expected: true },
    { name: "a release", line: RELEASE, expected: false },
    { name: "another button", line: logLine("HID buttonIndex=2 buttonState=1 notification"), expected: false },
    { name: "the stream's banner", line: "Filtering the log data using \"sender == ...\"", expected: false },
    { name: "an event without a message", line: "{}", expected: false },
  ])("$name → $expected", ({ line, expected }) => {
    expect(isPowerButtonPress(line)).toBe(expected);
  });
});

describe("PowerButtonShutdown", () => {
  type FakeStream = { emit(line: string): void; end(reason: string): void; stopped: boolean };
  let streams: FakeStream[];
  let shutDown: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let watcher: PowerButtonShutdown;

  const openStream: OpenLogStream = (onLine, onEnd) => {
    const stream: FakeStream = { emit: onLine, end: onEnd, stopped: false };
    streams.push(stream);
    return { stop: () => { stream.stopped = true; } };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    streams = [];
    shutDown = vi.fn(() => Promise.resolve());
    watcher = new PowerButtonShutdown({ openStream, shutDown, restartBaseMs: 1_000, restartMaxMs: 4_000 });
    watcher.start();
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shuts the Mac down once however often the button is pressed", () => {
    streams[0].emit(RELEASE);
    expect(shutDown).not.toHaveBeenCalled();

    streams[0].emit(PRESS);
    streams[0].emit(RELEASE);
    streams[0].emit(PRESS);

    expect(shutDown).toHaveBeenCalledTimes(1);
  });

  it("shuts down on the next press when a shutdown fails", async () => {
    shutDown.mockRejectedValueOnce(new Error("shutdown: NOT super-user"));
    streams[0].emit(PRESS);
    await vi.advanceTimersByTimeAsync(0);

    streams[0].emit(PRESS);

    expect(shutDown).toHaveBeenCalledTimes(2);
  });

  it("watches again, backing off, when the log stream ends", async () => {
    streams[0].end("log: exited");
    await vi.advanceTimersByTimeAsync(999);
    expect(streams).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(streams).toHaveLength(2);

    streams[1].end("log: exited");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(streams).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(streams).toHaveLength(3);

    streams[2].emit(PRESS);
    expect(shutDown).toHaveBeenCalledTimes(1);
  });

  it("stops watching, and stays stopped, when the bridge stops", async () => {
    watcher.stop();
    expect(streams[0].stopped).toBe(true);

    streams[0].end("killed");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(streams).toHaveLength(1);
  });
});
