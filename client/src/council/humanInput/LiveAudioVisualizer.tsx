import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface LiveAudioVisualizerProps {
  mediaRecorder: MediaRecorder;
  width?: number | string;
  height?: number | string;
  barWidth?: number;
  gap?: number;
  backgroundColor?: string;
  barColor?: string;
  fftSize?:
    | 32
    | 64
    | 128
    | 256
    | 512
    | 1024
    | 2048
    | 4096
    | 8192
    | 16384
    | 32768;
  maxDecibels?: number;
  minDecibels?: number;
  smoothingTimeConstant?: number;
}

export interface LiveAudioVisualizerPairProps extends LiveAudioVisualizerProps {
  /** Mounting point for the mirrored (left) canvas */
  leftHostRef: RefObject<HTMLElement | null>;
  /** Mounting point for the right canvas */
  rightHostRef: RefObject<HTMLElement | null>;
}

interface CustomCanvasRenderingContext2D extends CanvasRenderingContext2D {
  roundRect: (
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) => void;
}

export function calculateBarData(
  frequencyData: Uint8Array,
  width: number,
  barWidth: number,
  gap: number
): number[] {
  let units = width / (barWidth + gap);
  let step = Math.floor(frequencyData.length / units);

  if (units > frequencyData.length) {
    units = frequencyData.length;
    step = 1;
  }

  const data: number[] = [];

  for (let i = 0; i < units; i++) {
    let sum = 0;

    for (let j = 0; j < step && i * step + j < frequencyData.length; j++) {
      sum += frequencyData[i * step + j];
    }
    data.push(sum / step);
  }
  return data;
}

export function draw(
  data: number[],
  canvas: HTMLCanvasElement,
  barWidth: number,
  gap: number,
  backgroundColor: string,
  barColor: string
): void {
  const amp = canvas.height / 2;

  const ctx = canvas.getContext("2d") as CustomCanvasRenderingContext2D | null;
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  data.forEach((dp, i) => {
    ctx.fillStyle = barColor;

    const x = i * (barWidth + gap);
    const y = amp - dp / 2;
    const w = barWidth;
    const h = dp || 1;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 50);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  });
}

function useMediaRecorderAnalyser(
  mediaRecorder: MediaRecorder,
  {
    fftSize = 1024,
    maxDecibels = -10,
    minDecibels = -90,
    smoothingTimeConstant = 0.4,
  }: Pick<
    LiveAudioVisualizerProps,
    "fftSize" | "maxDecibels" | "minDecibels" | "smoothingTimeConstant"
  >
) {
  const [context, setContext] = useState<AudioContext>();
  const [analyser, setAnalyser] = useState<AnalyserNode>();

  useEffect(() => {
    if (!mediaRecorder.stream) return;

    const ctx = new AudioContext();
    const analyserNode = ctx.createAnalyser();
    setAnalyser(analyserNode);
    analyserNode.fftSize = fftSize;
    analyserNode.minDecibels = minDecibels;
    analyserNode.maxDecibels = maxDecibels;
    analyserNode.smoothingTimeConstant = smoothingTimeConstant;
    const source = ctx.createMediaStreamSource(mediaRecorder.stream);
    source.connect(analyserNode);
    setContext(ctx);

    return () => {
      source.disconnect();
      analyserNode.disconnect();
      if (ctx.state !== "closed") {
        void ctx.close();
      }
    };
  }, [
    mediaRecorder.stream,
    fftSize,
    minDecibels,
    maxDecibels,
    smoothingTimeConstant,
  ]);

  return { analyser, context };
}

export function LiveAudioVisualizer({
  mediaRecorder,
  width = "100%",
  height = "100%",
  barWidth = 2,
  gap = 1,
  backgroundColor = "transparent",
  barColor = "rgb(160, 198, 255)",
  fftSize = 1024,
  maxDecibels = -10,
  minDecibels = -90,
  smoothingTimeConstant = 0.4,
}: LiveAudioVisualizerProps): ReactElement {
  const { analyser, context } = useMediaRecorderAnalyser(mediaRecorder, {
    fftSize,
    maxDecibels,
    minDecibels,
    smoothingTimeConstant,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const processFrequencyData = useCallback(
    (data: Uint8Array): void => {
      if (!canvasRef.current) return;

      const dataPoints = calculateBarData(
        data,
        canvasRef.current.width,
        barWidth,
        gap
      );
      draw(
        dataPoints,
        canvasRef.current,
        barWidth,
        gap,
        backgroundColor,
        barColor
      );
    },
    [barWidth, gap, backgroundColor, barColor]
  );

  const report = useCallback(() => {
    if (!analyser || !context) return;

    const data = new Uint8Array(analyser.frequencyBinCount);

    if (mediaRecorder.state === "recording") {
      analyser.getByteFrequencyData(data);
      processFrequencyData(data);
      requestAnimationFrame(() => {
        reportRef.current();
      });
    } else if (mediaRecorder.state === "paused") {
      processFrequencyData(data);
    } else if (
      mediaRecorder.state === "inactive" &&
      context.state !== "closed"
    ) {
      void context.close();
    }
  }, [analyser, context, mediaRecorder, processFrequencyData]);

  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    if (analyser && mediaRecorder.state === "recording") {
      reportRef.current();
    }
  }, [analyser, mediaRecorder.state]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        aspectRatio: "unset",
      }}
    />
  );
}

/**
 * One Web Audio analyser and one RAF loop; draws the same frequency bars to
 * two canvases (e.g. mirrored left / normal right) via portals.
 */
export function LiveAudioVisualizerPair({
  mediaRecorder,
  leftHostRef,
  rightHostRef,
  width = "100%",
  height = "100%",
  barWidth = 2,
  gap = 1,
  backgroundColor = "transparent",
  barColor = "rgb(160, 198, 255)",
  fftSize = 1024,
  maxDecibels = -10,
  minDecibels = -90,
  smoothingTimeConstant = 0.4,
}: LiveAudioVisualizerPairProps): ReactElement | null {
  const { analyser, context } = useMediaRecorderAnalyser(mediaRecorder, {
    fftSize,
    maxDecibels,
    minDecibels,
    smoothingTimeConstant,
  });

  const canvasLeftRef = useRef<HTMLCanvasElement>(null);
  const canvasRightRef = useRef<HTMLCanvasElement>(null);
  const [hostsReady, setHostsReady] = useState(false);

  useLayoutEffect(() => {
    setHostsReady(
      !!(leftHostRef.current && rightHostRef.current)
    );
  }, [leftHostRef, rightHostRef]);

  const processFrequencyData = useCallback(
    (data: Uint8Array): void => {
      const left = canvasLeftRef.current;
      const right = canvasRightRef.current;
      if (!left || !right) return;

      const w = left.width;
      const dataPoints = calculateBarData(data, w, barWidth, gap);
      draw(dataPoints, left, barWidth, gap, backgroundColor, barColor);
      draw(dataPoints, right, barWidth, gap, backgroundColor, barColor);
    },
    [barWidth, gap, backgroundColor, barColor]
  );

  const report = useCallback(() => {
    if (!analyser || !context) return;

    const data = new Uint8Array(analyser.frequencyBinCount);

    if (mediaRecorder.state === "recording") {
      analyser.getByteFrequencyData(data);
      processFrequencyData(data);
      requestAnimationFrame(() => {
        pairReportRef.current();
      });
    } else if (mediaRecorder.state === "paused") {
      processFrequencyData(data);
    } else if (
      mediaRecorder.state === "inactive" &&
      context.state !== "closed"
    ) {
      void context.close();
    }
  }, [analyser, context, mediaRecorder, processFrequencyData]);

  const pairReportRef = useRef(report);
  pairReportRef.current = report;

  useEffect(() => {
    if (analyser && mediaRecorder.state === "recording") {
      pairReportRef.current();
    }
  }, [analyser, mediaRecorder.state]);

  const leftHost = leftHostRef.current;
  const rightHost = rightHostRef.current;

  if (!hostsReady || !leftHost || !rightHost) {
    return null;
  }

  const canvasStyle = { aspectRatio: "unset" as const };

  return (
    <>
      {createPortal(
        <canvas
          ref={canvasLeftRef}
          width={width}
          height={height}
          style={canvasStyle}
        />,
        leftHost
      )}
      {createPortal(
        <canvas
          ref={canvasRightRef}
          width={width}
          height={height}
          style={canvasStyle}
        />,
        rightHost
      )}
    </>
  );
}
