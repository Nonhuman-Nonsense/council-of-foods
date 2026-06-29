/**
 * Inworld word-alignment subtitle track.
 *
 * Validated semantics (Step 0, June 2026):
 *  - content_index is always 1 for a full multi-sentence turn.
 *  - Deltas are sequential windowed chunks (not cumulative).
 *  - Each TTS sentence is its own time-zero segment: times restart at s≈0.
 *  - An empty words[] chunk is the flush signal for the current sentence.
 *  - phonetic_details / is_partial never present on WebRTC — ignored.
 *  - First token per sentence is a silent lead-in: { w: "", s: 0, e: ~0.1 }.
 */

export type InworldWordToken = {
  /** Token string (word, punctuation, whitespace, or empty lead-in). */
  w: string;
  /** Start time in seconds, relative to the start of this TTS sentence segment. */
  s: number;
  /** End time in seconds, relative to the start of this TTS sentence segment. */
  e: number;
};

export type TimedSentence = {
  text: string;
  /** Seconds from the first sample of this response on the remote audio element. */
  start: number;
  /** Seconds from the first sample of this response on the remote audio element. */
  end: number;
};

export type InworldSubtitleTrack = {
  /** Feed one delta chunk in arrival order. */
  applyChunk: (contentIndex: number, words: ReadonlyArray<InworldWordToken>) => void;
  /** All fully-flushed sentences, in order. */
  getSentences: () => TimedSentence[];
  /**
   * Text of the sentence currently being accumulated (not yet flushed).
   * Returns null if the buffer is empty.
   */
  getPendingText: () => string | null;
  /**
   * Returns true when the pending buffer already contains a sentence-ending
   * punctuation token (`.` `!` `?`), meaning the full sentence text is known
   * even before the `words:[]` flush signal arrives.
   *
   * Use this to decide whether to display pending text: show it only when
   * complete, avoiding the word-by-word buildup that occurs while the sentence
   * is still streaming in.
   */
  isPendingComplete: () => boolean;
  /**
   * Best-known end of audible playback in seconds from the audio anchor.
   * Grows monotonically as alignment chunks arrive; null when nothing is known yet.
   */
  getPlaybackEndSec: () => number | null;
  /** Reset for a new response (response.created or cancel). */
  reset: () => void;
};

export type InworldSubtitleTrackOptions = {
  /** Called each time a sentence is flushed (useful for instrumentation). */
  onSentenceFlushed?: (sentence: TimedSentence, totalCount: number) => void;
};

/** Join tokens and strip surrounding whitespace. */
function buildText(buffer: InworldWordToken[]): string {
  return buffer.map((t) => t.w).join("").trim();
}

function flushBuffer(
  buffer: InworldWordToken[],
  segmentOffset: number,
  into: TimedSentence[],
  onFlushed?: (s: TimedSentence, total: number) => void
): number {
  if (buffer.length === 0) return segmentOffset;

  const text = buildText(buffer);
  if (!text) return segmentOffset;

  const start = segmentOffset + (buffer[0]?.s ?? 0);
  const end = segmentOffset + (buffer[buffer.length - 1]?.e ?? 0);

  const sentence = { text, start, end };
  into.push(sentence);
  onFlushed?.(sentence, into.length);

  // Next sentence's offset starts at this sentence's end.
  return end;
}

function pendingEndSec(buffer: InworldWordToken[], offset: number): number | null {
  if (buffer.length === 0) return null;
  return offset + (buffer[buffer.length - 1]?.e ?? 0);
}

export function createInworldSubtitleTrack(
  options: InworldSubtitleTrackOptions = {}
): InworldSubtitleTrack {
  const { onSentenceFlushed } = options;
  let sentences: TimedSentence[] = [];
  let currentBuffer: InworldWordToken[] = [];
  let segmentOffset = 0;

  const applyChunk = (_contentIndex: number, words: ReadonlyArray<InworldWordToken>): void => {
    if (words.length === 0) {
      // Empty chunk = end of sentence.
      segmentOffset = flushBuffer(currentBuffer, segmentOffset, sentences, onSentenceFlushed);
      currentBuffer = [];
      return;
    }

    // Backup: time reset while buffer has content means a new sentence started
    // without an explicit empty chunk (defensive, not observed in practice).
    const firstStart = words[0]?.s ?? 0;
    const bufferEndsLate = (currentBuffer[currentBuffer.length - 1]?.e ?? 0) > 0.05;
    if (bufferEndsLate && firstStart < 0.05) {
      segmentOffset = flushBuffer(currentBuffer, segmentOffset, sentences, onSentenceFlushed);
      currentBuffer = [];
    }

    currentBuffer.push(...words);
  };

  return {
    applyChunk,
    getSentences: () => sentences.slice(),
    getPendingText: () => {
      const text = buildText([...currentBuffer]);
      return text || null;
    },
    isPendingComplete: () => {
      // Walk backwards to find the last token with non-whitespace content.
      for (let i = currentBuffer.length - 1; i >= 0; i--) {
        const w = currentBuffer[i]?.w.trim() ?? "";
        if (w.length === 0) continue;
        return w === "." || w === "!" || w === "?" || w.endsWith(".") || w.endsWith("!") || w.endsWith("?");
      }
      return false;
    },
    getPlaybackEndSec: () => {
      const flushedEnd = sentences.length > 0 ? sentences[sentences.length - 1]!.end : null;
      const pendingEnd = pendingEndSec(currentBuffer, segmentOffset);
      if (flushedEnd != null && pendingEnd != null) return Math.max(flushedEnd, pendingEnd);
      return pendingEnd ?? flushedEnd;
    },
    reset: () => {
      sentences = [];
      currentBuffer = [];
      segmentOffset = 0;
    },
  };
}

/**
 * Returns the sentence that should be displayed at `playbackSec`.
 * A sentence is active from its `start` until the next sentence's `start`
 * (not until its own `end`) so the last sentence stays visible until audio ends.
 */
export function findActiveSentenceAtTime(
  sentences: TimedSentence[],
  playbackSec: number
): TimedSentence | null {
  let active: TimedSentence | null = null;
  for (const s of sentences) {
    if (playbackSec >= s.start) {
      active = s;
    } else {
      break;
    }
  }
  return active;
}

/**
 * Whether the agent should be considered audibly speaking for an Inworld turn.
 * Anchor set with unknown end (option A) → true until playback passes endSec.
 */
export function computeInworldAgentSpeaking(params: {
  anchorSet: boolean;
  playbackSec: number | null;
  endSec: number | null;
  responseCancelled: boolean;
}): boolean {
  if (params.responseCancelled) return false;
  if (!params.anchorSet) return false;
  if (params.endSec == null) return true;
  if (params.playbackSec == null) return true;
  return params.playbackSec < params.endSec;
}
