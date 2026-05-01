import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import {
  LiveAudioVisualizerPair,
  calculateBarData,
  draw,
} from "@council/humanInput/LiveAudioVisualizer";

describe("calculateBarData", () => {
  it("downsamples frequency bins to one value per bar column", () => {
    const bins = new Uint8Array(20);
    for (let i = 0; i < 20; i++) bins[i] = i;

    const width = 20;
    const barWidth = 2;
    const gap = 2;
    const units = Math.floor(width / (barWidth + gap));

    const bars = calculateBarData(bins, width, barWidth, gap);

    expect(bars).toHaveLength(units);
    expect(bars[0]).toBeGreaterThan(0);
    expect(bars.every((v) => typeof v === "number" && !Number.isNaN(v))).toBe(
      true
    );
  });

  it("caps units when the canvas is wider than the FFT bin count", () => {
    const bins = new Uint8Array(4);
    bins.set([10, 20, 30, 40]);

    const bars = calculateBarData(bins, 100, 1, 1);

    expect(bars).toHaveLength(4);
    expect(bars[0]).toBe(10);
    expect(bars[3]).toBe(40);
  });
});

describe("draw", () => {
  it("clears the canvas and paints bars", () => {
    const roundRect = vi.fn();
    const fill = vi.fn();
    const beginPath = vi.fn();
    const clearRect = vi.fn();
    const fillRect = vi.fn();

    const ctx = {
      clearRect,
      fillRect,
      beginPath,
      fill,
      roundRect,
      fillStyle: "",
    };

    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );

    draw([8, 16, 8], canvas, 3, 2, "transparent", "#ffffff");

    expect(clearRect).toHaveBeenCalledWith(0, 0, 40, 20);
    expect(beginPath).toHaveBeenCalled();
    expect(roundRect).toHaveBeenCalled();
    expect(fill).toHaveBeenCalled();
  });

  it("fills background when not transparent", () => {
    const clearRect = vi.fn();
    const fillRect = vi.fn();
    const ctx = {
      clearRect,
      fillRect,
      beginPath: vi.fn(),
      fill: vi.fn(),
      roundRect: vi.fn(),
      fillStyle: "",
    };

    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );

    draw([5], canvas, 2, 1, "#000000", "#ffffff");

    expect(fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
  });
});

function installAudioContextMock() {
  const createAnalyser = vi.fn();
  const createMediaStreamSource = vi.fn();

  const mockAnalyser = {
    fftSize: 0,
    minDecibels: 0,
    maxDecibels: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 16,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = 64 + i;
    }),
  };

  const mockSource = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  createAnalyser.mockReturnValue(mockAnalyser);
  createMediaStreamSource.mockReturnValue(mockSource);

  class MockAudioContext {
    state = "running";
    createAnalyser = createAnalyser;
    createMediaStreamSource = createMediaStreamSource;
    close = vi.fn(() => {
      this.state = "closed";
    });
  }

  const Original = globalThis.AudioContext;
  globalThis.AudioContext =
    MockAudioContext as unknown as typeof globalThis.AudioContext;

  return {
    restore: () => {
      globalThis.AudioContext = Original;
    },
    createAnalyser,
    createMediaStreamSource,
    mockAnalyser,
    mockSource,
  };
}

function fakeMediaStream(): MediaStream {
  const audioTrack = { readyState: "live" } as MediaStreamTrack;

  return {
    id: "test-stream",
    getTracks: () => [audioTrack],
    getAudioTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

function fakeInactiveMediaStream(): MediaStream {
  const audioTrack = { readyState: "ended" } as MediaStreamTrack;

  return {
    id: "inactive-stream",
    getTracks: () => [audioTrack],
    getAudioTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

function PairHarness({
  stream = fakeMediaStream(),
}: {
  stream?: MediaStream;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={leftRef} data-testid="viz-left-host" />
      <div ref={rightRef} data-testid="viz-right-host" />
      <LiveAudioVisualizerPair
        stream={stream}
        leftHostRef={leftRef}
        rightHostRef={rightRef}
        width={32}
        height={16}
        barWidth={2}
        gap={2}
        barColor="#abcdef"
      />
    </>
  );
}

describe("LiveAudioVisualizerPair", () => {
  let audioMock: ReturnType<typeof installAudioContextMock>;

  beforeEach(() => {
    audioMock = installAudioContextMock();
  });

  afterEach(() => {
    audioMock.restore();
    vi.restoreAllMocks();
  });

  it("portals one canvas into each host and shares a single analyser", async () => {
    const stream = fakeInactiveMediaStream();
    const { getByTestId } = render(<PairHarness stream={stream} />);

    await waitFor(() => {
      expect(getByTestId("viz-left-host").querySelector("canvas")).toBeTruthy();
    });

    const leftCanvas = getByTestId("viz-left-host").querySelector("canvas");
    const rightCanvas = getByTestId("viz-right-host").querySelector("canvas");

    expect(leftCanvas).toBeTruthy();
    expect(rightCanvas).toBeTruthy();
    expect(leftCanvas).not.toBe(rightCanvas);
    expect(leftCanvas).toHaveAttribute("width", "32");
    expect(rightCanvas).toHaveAttribute("width", "32");

    expect(audioMock.createAnalyser).toHaveBeenCalledTimes(1);
    expect(audioMock.createMediaStreamSource).toHaveBeenCalledTimes(1);
    expect(audioMock.createMediaStreamSource.mock.calls[0][0]).toBe(stream);
    expect(audioMock.mockSource.connect).toHaveBeenCalledWith(
      audioMock.mockAnalyser
    );
  });

  it("draws into both canvases while the stream has a live audio track", async () => {
    const mock2d = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      roundRect: vi.fn(),
      fillStyle: "",
    };
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => mock2d as unknown as CanvasRenderingContext2D);
    const rafSpy = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);

    render(<PairHarness stream={fakeMediaStream()} />);

    await waitFor(() => {
      expect(audioMock.mockAnalyser.getByteFrequencyData).toHaveBeenCalled();
      expect(mock2d.clearRect).toHaveBeenCalledTimes(2);
    });

    rafSpy.mockRestore();
    getContextSpy.mockRestore();
  });

  it("stops immediately when the stream audio track is not live", async () => {
    render(<PairHarness stream={fakeInactiveMediaStream()} />);

    await waitFor(() => {
      expect(audioMock.createMediaStreamSource).toHaveBeenCalledTimes(1);
    });

    expect(audioMock.mockAnalyser.getByteFrequencyData).not.toHaveBeenCalled();
    expect(audioMock.createAnalyser).toHaveBeenCalledTimes(1);
  });
});
