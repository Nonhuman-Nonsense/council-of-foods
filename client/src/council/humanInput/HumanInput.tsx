import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import ConversationControlIcon from "../ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';
import { useMobile, dvh } from "@/utils";
import { z } from "@/zIndexLayers";
import { useTranslation } from "react-i18next";
import { LiveAudioVisualizerPair } from "./LiveAudioVisualizer";
import Lottie from 'react-lottie-player';
import loading from "@assets/animations/loading.json";
import { bootstrapHumanInputRealtimeSession } from "@api/realtimeSession";
import { log } from "@/logger";
import {
  createRealtimeConnection,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import type { RealtimeProvider } from "@shared/RealtimeSessionTypes";
import React from 'react';
import micIcon from "@assets/mic.avif";
import type { ParticipationPhase } from "./participationPhase";
import { useButton, type ButtonLedMode } from "@/museum/button/useButton";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import { useCouncilSettings } from "@/settings/councilSettings";

const MAX_INPUT_LENGTH = 10000;
const FINISHING_QUIET_MS = 2000;
const FINISHING_NO_EVENTS_TIMEOUT_MS = 4500;
const FINISHING_HARD_TIMEOUT_MS = 12000;
/** PTT auto-submit requires at least this many words (accidental short utterances). */
const MIN_PTT_SUBMIT_WORDS = 3;

export function countTranscriptWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

interface InputAudioTranscriptionDeltaEvent {
  type: "conversation.item.input_audio_transcription.delta";
  item_id: string;
  content_index?: number;
  delta: string;
}

interface InputAudioTranscriptionCompletedEvent {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  content_index?: number;
  transcript: string;
}

interface InputAudioBufferSpeechStoppedEvent {
  type: "input_audio_buffer.speech_stopped";
}

interface InputAudioBufferSpeechStartedEvent {
  type: "input_audio_buffer.speech_started";
}

type HumanInputRealtimeEvent =
  | InputAudioTranscriptionDeltaEvent
  | InputAudioTranscriptionCompletedEvent
  | InputAudioBufferSpeechStoppedEvent
  | InputAudioBufferSpeechStartedEvent;

/**
 * idle       — disconnected; auto-connect effect fires immediately
 * connecting — bootstrap + WebRTC handshake in flight
 * ready      — connected, mic track disabled (pre-warmed, zero STT cost)
 * recording  — mic track enabled, live transcription active
 * finishing  — mic disabled, waiting for final transcript events to settle
 */
type ConnectionState =
  | "idle"
  | "connecting"
  | "ready"
  | "recording"
  | "finishing";

export interface TranscriptSegment {
  itemId: string;
  text: string;
}

export type TranscriptionDeltaMergeMode = "append" | "replace" | "adaptive";

export function transcriptSegmentKey(itemId: string, contentIndex = 0): string {
  return contentIndex === 0 ? itemId : `${itemId}:${contentIndex}`;
}

/** Soniox via Inworld mixes suffix chunks and full interim snapshots. */
export function transcriptionDeltaMergeModeForModel(model: string): TranscriptionDeltaMergeMode {
  return model.includes("soniox") ? "adaptive" : "replace";
}

function deltaWordCount(delta: string): number {
  const trimmed = delta.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * append — OpenAI incremental suffixes
 * replace — AssemblyAI cumulative snapshots
 * adaptive — Soniox via Inworld: suffix append or full-restatement replace
 *
 * Soniox streams two kinds of delta without any wire tag to distinguish them:
 *   - Suffix chunk (1–2 short tokens): continuation of the provisional hypothesis
 *   - Full snapshot (3+ words): complete re-statement of the utterance from the start,
 *     possibly revising earlier words (non-final token correction)
 *
 * Word count is the robust discriminator. Prefix/first-token matching breaks when the
 * model revises the first word of the utterance (e.g. "ånden"→"hunden"). Length alone
 * is also fragile (a 2-word suffix can be 12+ chars). The `completed` event always
 * overwrites with the authoritative final transcript, so any transient misclassification
 * of a 1–2 word snapshot is cosmetic and self-correcting.
 */
export function mergeTranscriptionDelta(
  mode: TranscriptionDeltaMergeMode,
  existing: string,
  delta: string,
): string {
  if (!delta) return existing;
  if (mode === "replace") return delta;
  if (mode === "append") return existing + delta;

  // Exact containment shortcuts — content-independent, always safe.
  if (!existing) return delta;
  if (delta.startsWith(existing)) return delta;
  if (existing.endsWith(delta)) return existing;

  const trimmedDelta = delta.trimStart();

  // Delta is a forward extension of existing → replace with extended form.
  if (trimmedDelta.startsWith(existing.trim())) return trimmedDelta;

  // Multi-word delta = full Soniox interim snapshot → replace, regardless of first word.
  if (deltaWordCount(delta) >= 3) return trimmedDelta;

  // Short delta (1–2 tokens) = suffix chunk → append.
  return existing + delta;
}

export function upsertTranscriptSegment(
  segments: TranscriptSegment[],
  itemId: string,
  text: string
): TranscriptSegment[] {
  const existingIndex = segments.findIndex(segment => segment.itemId === itemId);

  if (existingIndex === -1) {
    return [...segments, { itemId, text }];
  }

  const next = [...segments];
  next[existingIndex] = { itemId, text };
  return next;
}

export function formatTranscriptInputValue({
  previousTranscript,
  transcriptSegments,
  maxLength,
}: {
  previousTranscript: string;
  transcriptSegments: TranscriptSegment[];
  maxLength: number;
}): string {
  const transcriptText = transcriptSegments
    .map(segment => segment.text)
    .filter(text => text.trim().length > 0)
    .join(" ")
    .trim();
  const baseText = previousTranscript.trim();
  const combined = [baseText, transcriptText].filter(Boolean).join(" ");

  return combined.slice(0, maxLength);
}

export function scrollTextareaToBottom(textarea: HTMLTextAreaElement) {
  textarea.scrollTop = textarea.scrollHeight;
}

function readTranscriptionModel(session: Record<string, unknown>): string {
  const audio = session.audio;
  if (!audio || typeof audio !== "object") return "";
  const input = (audio as { input?: unknown }).input;
  if (!input || typeof input !== "object") return "";
  const transcription = (input as { transcription?: unknown }).transcription;
  if (!transcription || typeof transcription !== "object") return "";
  const model = (transcription as { model?: unknown }).model;
  return typeof model === "string" ? model : "";
}

function readBootstrapSessionSummary(session: Record<string, unknown>): Record<string, unknown> {
  const model = readTranscriptionModel(session);
  let transcriptionLanguage = "";
  let transcriptionPrompt = "";

  const audio = session.audio;
  if (audio && typeof audio === "object") {
    const input = (audio as { input?: unknown }).input;
    if (input && typeof input === "object") {
      const transcription = (input as { transcription?: unknown }).transcription;
      if (transcription && typeof transcription === "object") {
        const language = (transcription as { language?: unknown }).language;
        const prompt = (transcription as { prompt?: unknown }).prompt;
        if (typeof language === "string") transcriptionLanguage = language;
        if (typeof prompt === "string") transcriptionPrompt = prompt;
      }
    }
  }

  let languageHints: string[] | undefined;
  const providerData = session.providerData;
  if (providerData && typeof providerData === "object") {
    const stt = (providerData as { stt?: unknown }).stt;
    if (stt && typeof stt === "object") {
      const hints = (stt as { language_hints?: unknown }).language_hints;
      if (Array.isArray(hints)) {
        languageHints = hints.filter((hint): hint is string => typeof hint === "string");
      }
    }
  }

  return {
    transcriptionModel: model,
    transcriptionLanguage,
    transcriptionPrompt,
    languageHints,
    mergeMode: transcriptionDeltaMergeModeForModel(model),
  };
}

/** Flat REALTIME lines prefixed for human-input debugging. */
function hiLog(step: string, data?: Record<string, unknown>): void {
  log.flat("REALTIME", `human-input | ${step}`, data);
}

function dcEventType(event: unknown): string {
  if (event && typeof event === "object" && "type" in event) {
    return typeof (event as { type: unknown }).type === "string"
      ? (event as { type: string }).type
      : "unknown";
  }
  return "unknown";
}

function dcEventError(event: unknown): Record<string, unknown> | undefined {
  if (!event || typeof event !== "object") return undefined;
  const err = (event as Record<string, unknown>).error;
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  return { type: e.type, code: e.code, message: e.message, param: e.param };
}

function isHumanInputRealtimeEvent(event: unknown): event is HumanInputRealtimeEvent {
  if (!event || typeof event !== "object" || !("type" in event)) return false;

  const type = (event as { type: unknown }).type;
  return (
    type === "conversation.item.input_audio_transcription.delta" ||
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "input_audio_buffer.speech_stopped" ||
    type === "input_audio_buffer.speech_started"
  );
}

interface HumanInputProps {
  /** "warm" = pre-connect silently; "active" = show UI */
  phase: ParticipationPhase;
  isPanelist: boolean;
  currentSpeakerName: string;
  onSubmitHumanMessage: (text: string) => void;
  /** Museum idle timeout: visitor released the button without submitting. */
  onAbandonHumanTurn: () => void;
  liveKey: string;
  /**
   * True when running in museum mode with push-to-talk enabled.
   * Activates hardware button control, LED management, auto-submit on release,
   * and hides mic/send UI (hardware button is the only interaction surface).
   */
  isButtonMuseumMode?: boolean;
}

// Workaround for TextareaAutosize strict height type
type TextareaStyle = Omit<React.CSSProperties, 'height'> & { height?: number };

/**
 * HumanInput Component
 *
 * Manages the user interface for human participation, supporting both voice and text input.
 *
 * Core Logic:
 * - **Pre-warm**: When mounted with phase="warm", the WebRTC session is established
 *   immediately with the mic track disabled (zero STT cost). When phase flips to
 *   "active", the connection is already ready and recording starts instantly on click.
 * - **Voice Input**: Opens a server-proxied realtime WebRTC session and receives live
 *   transcript deltas/finals. For Inworld WebRTC, the session is mirrored with
 *   `session.update` on the data channel when it opens (per docs).
 * - **Text Input**: Provides a fallback manual text entry.
 * - **Lifecycle**: The component auto-connects on mount and auto-reconnects if the
 *   connection drops (state returns to "idle"). Cleanup on unmount closes everything.
 */
function HumanInput({ phase, isPanelist, currentSpeakerName, onSubmitHumanMessage, onAbandonHumanTurn, liveKey, isButtonMuseumMode = false }: HumanInputProps): React.ReactElement | null {
  const { agentMode } = useCouncilSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [canContinue, setCanContinue] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [previousTranscript, setPreviousTranscript] = useState<string>("");

  const inputArea = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobile();

  const connectionStateRef = useRef<ConnectionState>("idle");
  const inputAudioActiveRef = useRef<boolean>(false);
  const realtimeProviderRef = useRef<RealtimeProvider>("inworld");
  const transcriptionModelRef = useRef<string>("");
  const completedTranscriptKeysRef = useRef<Set<string>>(new Set());
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const finishingQuietTimerRef = useRef<number | null>(null);
  const finishingNoEventsTimerRef = useRef<number | null>(null);
  const finishingHardTimerRef = useRef<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  const button = useButton("human-input");

  const humanInputLedMode = useMemo((): ButtonLedMode => {
    if (connectionState === "recording") return "on";
    // Finishing: waiting for final transcript — cannot start another take.
    // Connecting: not ready to record yet. Empty/no-speech releases skip finishing
    // straight back to ready (pulse) so the visitor can try again.
    if (connectionState === "finishing" || connectionState === "connecting") return "off";
    return "pulse";
  }, [connectionState]);

  useEffect(() => {
    if (phase !== "active" || agentMode !== "ptt") return;
    button.claim();
    return () => button.release();
  }, [button.claim, button.release, phase, agentMode]);

  useEffect(() => {
    if (phase !== "active") return;
    button.setLed(humanInputLedMode);
  }, [button.setLed, phase, humanInputLedMode]);

  // Set on PTT release; cleared on submit or empty release.
  const pendingPttAutoSubmitRef = useRef(false);

  const { t, i18n } = useTranslation();

  const maxInputLength = MAX_INPUT_LENGTH;

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);


  useLayoutEffect(() => {
    if (!inputArea.current) return;
    scrollTextareaToBottom(inputArea.current);
  }, [inputValue]);

  // Auto-connect: fires on mount (idle) and reconnects if connection drops.
  useEffect(() => {
    if (connectionState === "idle") {
      void connect();
    }
   
  }, [connectionState]);

  // Full cleanup on unmount — aborts any in-flight handshake and closes connection.
  useEffect(() => {
    return () => {
      clearFinishingTimers();
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
      setMicStream(null);
    };
  }, []);

  // ── PTT input ───────────────────────────────────────────────────────────────

  // PTT press → start recording when ready (also covers button held during pre-warm).
  useEffect(() => {
    if (agentMode !== "ptt" || phase !== "active") return;
    if (!button.pressed) return;
    startRecording();
   
  }, [button.pressed, agentMode, phase, connectionState, inputValue]);

  // PTT release → finish session and queue an auto-submit attempt.
  useEffect(() => {
    if (agentMode !== "ptt") return;
    if (!button.pressed && connectionState === "recording") {
      pendingPttAutoSubmitRef.current = true;
      finishRealtimeSession();
    }
   
  }, [button.pressed, agentMode, connectionState]);

  // PTT auto-submit: attempt on every release once ready, and again when the
  // transcript catches up (segments can update after connectionState is "ready").
  useEffect(() => {
    if (agentMode !== "ptt" || !pendingPttAutoSubmitRef.current || connectionState !== "ready") return;

    const text = formatTranscriptInputValue({
      previousTranscript,
      transcriptSegments,
      maxLength: maxInputLength,
    }).trim();

    const words = countTranscriptWords(text);
    if (words === 0) {
      pendingPttAutoSubmitRef.current = false;
      return;
    }
    if (words < MIN_PTT_SUBMIT_WORDS) {
      hiLog("auto-submit-skip-short", { words, minWords: MIN_PTT_SUBMIT_WORDS, text });
      return;
    }

    hiLog("auto-submit", { words, text });
    pendingPttAutoSubmitRef.current = false;
    onSubmitHumanMessage(text.substring(0, maxInputLength));
    setInputValue("");
    setPreviousTranscript("");
    setTranscriptSegments([]);
    completedTranscriptKeysRef.current.clear();
    setCanContinue(false);
  }, [connectionState, transcriptSegments, previousTranscript, agentMode, maxInputLength, onSubmitHumanMessage]);

  const pttSessionActive = agentMode === "ptt" && phase === "active";

  useButtonBanner({
    owner: "human-input",
    sessionActive: pttSessionActive,
    micOpen: button.pressed,
    isConnecting: connectionState === "connecting" || connectionState === "finishing",
    activityDeps: [inputValue, transcriptSegments],
    onIdleTerminal: onAbandonHumanTurn,
    canIdleTerminal: () =>
      pttSessionActive &&
      !button.pressed &&
      connectionState !== "recording" &&
      connectionState !== "finishing",
    terminalDeps: [connectionState, button.pressed],
  });

  function transcriptionDeltaMergeMode(): TranscriptionDeltaMergeMode {
    if (realtimeProviderRef.current === "openai") return "append";
    return transcriptionDeltaMergeModeForModel(transcriptionModelRef.current);
  }

  function handleRealtimeEvent(event: HumanInputRealtimeEvent) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      const segmentKey = transcriptSegmentKey(event.item_id, event.content_index ?? 0);
      if (completedTranscriptKeysRef.current.has(segmentKey)) {
        hiLog("delta-blocked-completed", {
          segmentKey,
          delta: event.delta,
          mergeMode: transcriptionDeltaMergeMode(),
        });
        return;
      }

      inputAudioActiveRef.current = true;
      const mergeMode = transcriptionDeltaMergeMode();
      setTranscriptSegments(prev => {
        const existing = prev.find(segment => segment.itemId === segmentKey)?.text ?? "";
        const next = mergeTranscriptionDelta(mergeMode, existing, event.delta);
        hiLog("delta-applied", {
          segmentKey,
          mergeMode,
          existing,
          delta: event.delta,
          next,
        });
        return upsertTranscriptSegment(prev, segmentKey, next);
      });
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const segmentKey = transcriptSegmentKey(event.item_id, event.content_index ?? 0);
      if (event.transcript.trim()) {
        completedTranscriptKeysRef.current.add(segmentKey);
      }
      inputAudioActiveRef.current = false;
      setTranscriptSegments(prev => upsertTranscriptSegment(prev, segmentKey, event.transcript));
      hiLog("completed-applied", {
        segmentKey,
        transcript: event.transcript,
        locksSegment: event.transcript.trim().length > 0,
      });
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      inputAudioActiveRef.current = false;
      hiLog("speech-stopped", { connectionState: connectionStateRef.current });
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      inputAudioActiveRef.current = true;
      hiLog("speech-started", { connectionState: connectionStateRef.current });
    }
  }

  function clearFinishingTimers() {
    if (finishingQuietTimerRef.current !== null) {
      window.clearTimeout(finishingQuietTimerRef.current);
      finishingQuietTimerRef.current = null;
    }
    if (finishingNoEventsTimerRef.current !== null) {
      window.clearTimeout(finishingNoEventsTimerRef.current);
      finishingNoEventsTimerRef.current = null;
    }
    if (finishingHardTimerRef.current !== null) {
      window.clearTimeout(finishingHardTimerRef.current);
      finishingHardTimerRef.current = null;
    }
  }

  function closeRealtimeConnection() {
    clearFinishingTimers();
    connectionRef.current?.close();
    connectionRef.current = null;
    setMicStream(null);
  }

  /**
   * Establishes the WebRTC session with the mic track disabled.
   * Lands in "ready" — no audio is sent until startRecording() is called.
   * Safe to call when state is "idle"; aborts any previous in-flight attempt.
   */
  async function connect() {
    const controller = new AbortController();
    startAbortRef.current?.abort();
    startAbortRef.current = controller;
    setConnectionState("connecting");
    hiLog("connect-start", { language: i18n.language, phase });

    try {
      const bootstrap = await bootstrapHumanInputRealtimeSession(
        { feature: "human-input", language: i18n.language },
        liveKey,
        controller.signal
      );

      const sessionForDc = bootstrap.session;
      const providerForDc: RealtimeProvider = bootstrap.provider;
      realtimeProviderRef.current = bootstrap.provider;
      transcriptionModelRef.current = readTranscriptionModel(bootstrap.session);
      hiLog("bootstrap-ok", {
        provider: bootstrap.provider,
        language: i18n.language,
        ...readBootstrapSessionSummary(bootstrap.session),
      });

      const connection = await createRealtimeConnection({
        session: bootstrap.session,
        iceServers: bootstrap.iceServers,
        callPath: "/api/realtime/call",
        callHeaders: {
          Authorization: `Bearer ${liveKey}`,
        },
        callBodyExtras: {
          feature: "human-input",
          provider: bootstrap.provider,
        },
        signal: controller.signal,
        onOpen:
          providerForDc === "inworld"
            ? ({ dc }) => {
                if (controller.signal.aborted) return;
                try {
                  dc.send(JSON.stringify({ type: "session.update", session: sessionForDc }));
                  hiLog("session-update-sent", readBootstrapSessionSummary(sessionForDc));
                } catch (err) {
                  hiLog("session-update-failed", {
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
            : undefined,
        onRemoteTrack: () => undefined,
        onEvent: (event) => {
          if (!isHumanInputRealtimeEvent(event)) {
            const type = dcEventType(event);
            const error = dcEventError(event);
            if (error) {
              hiLog("dc-error", { type, error });
            } else if (type !== "session.created" && type !== "session.updated") {
              hiLog("dc-unhandled-type", { type });
            }
            return;
          }

          handleRealtimeEvent(event);
        },
        onClose: (reason) => {
          hiLog("connection-closed", { reason, aborted: controller.signal.aborted });
          // Unexpected close — go to idle so the auto-connect effect re-fires.
          if (!controller.signal.aborted) {
            closeRealtimeConnection();
            setConnectionState("idle");
          }
        },
      });

      if (controller.signal.aborted) {
        hiLog("connect-aborted", { language: i18n.language });
        connection.close();
        return;
      }

      // Gate the mic: track stays in the peer connection but sends no audio.
      // STT only bills on real audio, so this warm connection is free.
      const tracks = connection.micStream.getAudioTracks();
      tracks.forEach(track => {
        track.enabled = false;
      });

      connectionRef.current = connection;
      hiLog("connect-ready", {
        language: i18n.language,
        transcriptionModel: transcriptionModelRef.current,
        mergeMode: transcriptionDeltaMergeMode(),
        micTracks: tracks.map(track => ({
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          label: track.label,
        })),
        pcState: connection.pc.connectionState,
        dcState: connection.dc.readyState,
      });
      setConnectionState("ready");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        hiLog("connect-aborted", { language: i18n.language });
        return;
      }
      hiLog("connect-error", {
        language: i18n.language,
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : undefined,
      });
      console.error("Failed to start realtime human input session", err);
      setConnectionState("idle");
    } finally {
      if (startAbortRef.current === controller) {
        startAbortRef.current = null;
      }
    }
  }

  /**
   * Opens the mic gate and begins transcription.
   * Only callable from "ready" state.
   * Exposed as a standalone function so PTT can call it directly.
   */
  function startRecording() {
    if (connectionState !== "ready" || !connectionRef.current) {
      hiLog("record-skip", {
        reason: connectionState !== "ready" ? "not-ready" : "no-connection",
        connectionState,
        hasConnection: Boolean(connectionRef.current),
        buttonPressed: button.pressed,
        phase,
      });
      return;
    }

    clearFinishingTimers();
    pendingPttAutoSubmitRef.current = false;
    inputAudioActiveRef.current = false;
    completedTranscriptKeysRef.current.clear();
    setTranscriptSegments([]);
    setPreviousTranscript(inputValue);
    const tracks = connectionRef.current.micStream.getAudioTracks();
    tracks.forEach(track => {
      track.enabled = true;
    });
    setMicStream(connectionRef.current.micStream);
    hiLog("record-start", {
      language: i18n.language,
      provider: realtimeProviderRef.current,
      transcriptionModel: transcriptionModelRef.current,
      mergeMode: transcriptionDeltaMergeMode(),
      previousTranscript: inputValue,
      micTracks: tracks.map(track => ({
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label,
      })),
      pcState: connectionRef.current.pc.connectionState,
      dcState: connectionRef.current.dc.readyState,
    });
    setConnectionState("recording");
  }

  /**
   * Closes the mic gate and waits for the final transcript to settle before
   * returning to "ready". The connection stays open for a potential re-record.
   * Exposed as a standalone function so PTT can call it directly.
   */
  function finishRealtimeSession() {
    if (!connectionRef.current) {
      hiLog("finish-skip-no-connection", { connectionState: connectionStateRef.current });
      setConnectionState("idle");
      return;
    }

    connectionStateRef.current = "finishing";
    setConnectionState("finishing");
    connectionRef.current.micStream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    setMicStream(null);

    const hadSpeech = inputAudioActiveRef.current;
    const segmentSnapshot = transcriptSegments.map(segment => ({
      itemId: segment.itemId,
      text: segment.text,
    }));
    hiLog("record-finish", {
      hadSpeech,
      segmentCount: segmentSnapshot.length,
      segments: segmentSnapshot,
      displayText: formatTranscriptInputValue({
        previousTranscript,
        transcriptSegments,
        maxLength: maxInputLength,
      }),
    });

    if (!hadSpeech) {
      hiLog("finish-no-speech-immediate-ready", {
        hint: "No speech_started/delta/completed before release — check VAD, mic, or STT backend",
      });
      setConnectionState("ready");
      return;
    }

    hiLog("finish-wait-for-transcript", {
      quietMs: FINISHING_QUIET_MS,
      noEventsTimeoutMs: FINISHING_NO_EVENTS_TIMEOUT_MS,
      hardTimeoutMs: FINISHING_HARD_TIMEOUT_MS,
    });
    finishingNoEventsTimerRef.current = window.setTimeout(() => {
      hiLog("finish-timeout-no-events", { waitedMs: FINISHING_NO_EVENTS_TIMEOUT_MS });
      setConnectionState("ready");
    }, FINISHING_NO_EVENTS_TIMEOUT_MS);
    finishingHardTimerRef.current = window.setTimeout(() => {
      hiLog("finish-hard-timeout-reconnect", { waitedMs: FINISHING_HARD_TIMEOUT_MS });
      closeRealtimeConnection();
      setConnectionState("idle");
    }, FINISHING_HARD_TIMEOUT_MS);
  }

  function scheduleFinishingQuietClose() {
    if (connectionStateRef.current !== "finishing") return;

    if (finishingNoEventsTimerRef.current !== null) {
      window.clearTimeout(finishingNoEventsTimerRef.current);
      finishingNoEventsTimerRef.current = null;
    }

    if (finishingQuietTimerRef.current !== null) {
      window.clearTimeout(finishingQuietTimerRef.current);
    }

    finishingQuietTimerRef.current = window.setTimeout(() => {
      hiLog("finish-quiet-close", { waitedMs: FINISHING_QUIET_MS });
      setConnectionState("ready");
    }, FINISHING_QUIET_MS);
  }

  function handleStartStopRecording() {
    if (connectionState === "ready") {
      if (inputValue.length >= maxInputLength) {
        setCanContinue(true);
        return;
      }
      startRecording();
    } else if (connectionState === "recording") {
      finishRealtimeSession();
    }
    // connecting / finishing: no-op — loading UI is shown instead of the button
  }

  useEffect(() => {
    if (connectionState === "recording") {
      const nextValue = formatTranscriptInputValue({
        previousTranscript,
        transcriptSegments,
        maxLength: maxInputLength,
      });
      setInputValue(nextValue);
      updateCanContinue(nextValue);

      if (nextValue.length >= maxInputLength) {
        setPreviousTranscript(nextValue);
        setTranscriptSegments([]);
        finishRealtimeSession();
      }
    } else {
      const nextValue = formatTranscriptInputValue({
        previousTranscript,
        transcriptSegments,
        maxLength: maxInputLength,
      });
      setInputValue(nextValue);
      updateCanContinue(nextValue);
    }
  // finishRealtimeSession is stable (no deps), safe to omit
   
  }, [transcriptSegments, connectionState, previousTranscript, maxInputLength]);

  function inputFocused(_e: React.FocusEvent) {
    if (connectionState === "recording") {
      finishRealtimeSession();
    }
    // Don't interrupt connecting/ready — user just wants to type
  }

  function updateCanContinue(value: string) {
    setCanContinue(value.length > 0 && value.trim().length !== 0);
  }

  function inputChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    setInputValue(nextValue);
    updateCanContinue(nextValue);
  }

  const canSubmitNow =
    (connectionState === "idle" || connectionState === "ready") && canContinue;

  function checkEnter(e: React.KeyboardEvent) {
    if (canSubmitNow && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    if (!canSubmitNow) return;

    onSubmitHumanMessage(inputValue.substring(0, maxInputLength));
    setInputValue("");
    setPreviousTranscript("");
    setTranscriptSegments([]);
    completedTranscriptKeysRef.current.clear();
    setCanContinue(false);
    // Connection stays open — component will unmount shortly as phase → off,
    // and the unmount cleanup closes everything.
  }

  // During warm phase: connected silently, no UI.
  if (phase !== "active") return null;

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    bottom: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const micStyle: React.CSSProperties = {
    position: "absolute",
    bottom: `-${2}${dvh}`,
    height: `${45}${dvh}`,
    minHeight: "135px",
    zIndex: z.councilMic,
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle: React.CSSProperties = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    zIndex: z.councilControls,
    display: "flex",
    alignItems: "center"
  };

  const textStyle: TextareaStyle = {
    backgroundColor: "transparent",
    width: "70vw",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile ? "0" : undefined,
    marginBottom: isMobile ? "-8px" : undefined,
    lineHeight: "1.1em",
    resize: "none",
    padding: "0",
  };

  // idle is transient — the auto-connect effect fires immediately, so show a spinner.
  // In PTT museum mode only show a spinner while the pre-warm is in flight (connecting);
  // once ready, the LED pulsing is the affordance — no on-screen spinner needed.
  const isWaitingForRealtime = isButtonMuseumMode
    ? connectionState === "connecting" || connectionState === "finishing"
    : connectionState === "idle" || connectionState === "connecting" || connectionState === "finishing";

  const placeholder = isButtonMuseumMode
    ? t("ptt.humanPlaceholder")
    : isPanelist
      ? t("human.panelist", { name: currentSpeakerName })
      : t("human.placeholder");

  return (<>
    <div style={wrapperStyle}>
      <img alt="Say something!" src={micIcon} style={micStyle} />
      <div style={{ zIndex: z.humanInputField, position: "relative", pointerEvents: "auto" }}>
        <TextareaAutosize
          ref={inputArea}
          style={textStyle}
          onChange={inputChanged}
          onKeyDown={checkEnter}
          onFocus={inputFocused}
          className="unfocused"
          minRows={1}
          maxRows={6}
          value={inputValue}
          cacheMeasurements={false}
          maxLength={maxInputLength}
          placeholder={placeholder}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", pointerEvents: "auto", justifyContent: "center" }}>
        <div
          ref={vizLeftHostRef}
          style={{ ...divStyle, transform: "scale(-1, -1)" }}
        />
        <div style={divStyle}>
          {isWaitingForRealtime &&
            <Lottie play loop animationData={loading} style={{ height: isMobile ? 45 : 56 }} />
          }
          {!isWaitingForRealtime && !isButtonMuseumMode &&
            <ConversationControlIcon
              icon={(connectionState === 'recording' ? "record_voice_on" : "record_voice_off")}
              onClick={handleStartStopRecording}
            />
          }
          {isButtonMuseumMode && connectionState === 'recording' &&
            <ConversationControlIcon icon="record_voice_on" onClick={() => undefined} />
          }
        </div>
        <div style={divStyle} ref={vizRightHostRef}>
          {canSubmitNow && !isButtonMuseumMode &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={submitAndContinue}
            />
          }
        </div>
        {connectionState === 'recording' && micStream && (
          <LiveAudioVisualizerPair
            stream={micStream}
            leftHostRef={vizLeftHostRef}
            rightHostRef={vizRightHostRef}
            width={100}
            height={40}
            barWidth={3}
            gap={2}
            barColor="#ffffff"
            smoothingTimeConstant={0.85}
          />
        )}
      </div>
    </div>
  </>);
}

export default HumanInput;
