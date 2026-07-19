import { splitSentences } from "@shared/textUtils";

const DEFAULT_BASE_CHARS_PER_SEC = 14;
const DEFAULT_MIN_DURATION_MS = 800;
const DEFAULT_MAX_DURATION_MS = 8000;

type TimerHandle = ReturnType<typeof setTimeout>;

export type CaptionScheduler = {
  beginResponse: () => void;
  appendDelta: (delta: string) => void;
  finalize: (transcript: string) => void;
  setAudioAnchor: (nowMs: number) => void;
  cancel: () => void;
  setSpeed: (speed: number | undefined) => void;
};

export type CaptionSchedulerOptions = {
  onCaption: (text: string | null) => void;
  baseCharsPerSec?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  now?: () => number;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
};

const defaultNow = (): number => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
};

function isTerminalChar(text: string, index: number): boolean {
  const char = text[index];
  if (char === "." || char === "!" || char === "?" || char === "…" || char === ";" || char === "\n") {
    return true;
  }
  return char === ":" && text[index + 1] !== "\xa0";
}

function findLastCommittedIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (isTerminalChar(text, i)) return i;
  }
  return -1;
}

export function createCaptionScheduler(options: CaptionSchedulerOptions): CaptionScheduler {
  const now = options.now ?? defaultNow;
  const setTimeoutFn = options.setTimeoutFn ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  const baseCharsPerSec = options.baseCharsPerSec ?? DEFAULT_BASE_CHARS_PER_SEC;
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  let speed = 1;
  let buffer = "";
  let knownSentenceCount = 0;
  let sentences: string[] = [];
  let nextDisplayIndex = 0;
  let audioAnchorMs: number | null = null;
  let nextDueMs: number | null = null;
  let timer: TimerHandle | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  const sentenceDurationMs = (sentence: string): number => {
    const charsPerSec = Math.max(1, baseCharsPerSec * speed);
    const estimated = (sentence.length / charsPerSec) * 1000;
    return Math.min(maxDurationMs, Math.max(minDurationMs, estimated));
  };

  const scheduleNext = () => {
    if (timer != null || audioAnchorMs == null || nextDisplayIndex >= sentences.length) return;

    const dueMs = nextDueMs ?? audioAnchorMs;
    const delayMs = Math.max(0, dueMs - now());

    timer = setTimeoutFn(() => {
      timer = null;
      if (audioAnchorMs == null || nextDisplayIndex >= sentences.length) return;

      const displayNow = now();
      const plannedDisplayMs = nextDueMs ?? audioAnchorMs;
      const actualDisplayMs = Math.max(displayNow, plannedDisplayMs);
      const sentence = sentences[nextDisplayIndex];
      nextDisplayIndex += 1;
      nextDueMs = actualDisplayMs + sentenceDurationMs(sentence);
      options.onCaption(sentence);
      scheduleNext();
    }, delayMs);
  };

  const addSentences = (nextSentences: string[]) => {
    if (nextSentences.length === 0) return;
    sentences = [...sentences, ...nextSentences];
    scheduleNext();
  };

  const commitCompletedSentences = () => {
    const lastCommittedIndex = findLastCommittedIndex(buffer);
    if (lastCommittedIndex === -1) return;

    const committedText = buffer.slice(0, lastCommittedIndex + 1);
    const committedSentences = splitSentences(committedText);
    const newSentences = committedSentences.slice(knownSentenceCount);
    knownSentenceCount = committedSentences.length;
    addSentences(newSentences);
  };

  return {
    beginResponse: () => {
      clearTimer();
      buffer = "";
      knownSentenceCount = 0;
      sentences = [];
      nextDisplayIndex = 0;
      audioAnchorMs = null;
      nextDueMs = null;
    },

    appendDelta: (delta) => {
      if (!delta) return;
      buffer += delta;
      commitCompletedSentences();
    },

    finalize: (transcript) => {
      if (!transcript || transcript.trim().length === 0) return;
      buffer = transcript;
      const finalSentences = splitSentences(transcript);
      const newSentences = finalSentences.slice(knownSentenceCount);
      knownSentenceCount = finalSentences.length;
      addSentences(newSentences);
    },

    setAudioAnchor: (nowMs) => {
      if (audioAnchorMs != null) return;
      audioAnchorMs = nowMs;
      nextDueMs = nowMs;
      scheduleNext();
    },

    cancel: () => {
      clearTimer();
      buffer = "";
      knownSentenceCount = 0;
      sentences = [];
      nextDisplayIndex = 0;
      audioAnchorMs = null;
      nextDueMs = null;
      options.onCaption(null);
    },

    setSpeed: (nextSpeed) => {
      if (typeof nextSpeed !== "number" || !Number.isFinite(nextSpeed) || nextSpeed <= 0) {
        speed = 1;
        return;
      }
      speed = nextSpeed;
    },
  };
}
