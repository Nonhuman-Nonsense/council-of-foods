import { useState, useEffect, useLayoutEffect, useRef } from "react";
import ConversationControlIcon from "../ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';
import { useMobile, dvh } from "@/utils";
import { useTranslation } from "react-i18next";
import { LiveAudioVisualizerPair } from "./LiveAudioVisualizer";
import Lottie from 'react-lottie-player';
import loading from "@assets/animations/loading.json";
import { bootstrapHumanInputRealtimeSession } from "@api/realtimeSession";
import {
  createRealtimeConnection,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import type { RealtimeProvider } from "@shared/RealtimeSessionTypes";
import React from 'react';
import micIcon from "@assets/mic.avif";
import type { ParticipationPhase } from "./participationPhase";
import {
  useMuseumButtonSelector,
  useMuseumButtonSetLedMode,
} from "@/museum/button/useMuseumButtonStore";
import { claimButton } from "@/museum/button/buttonOwnership";

const MAX_INPUT_LENGTH = 10000;
const FINISHING_QUIET_MS = 2000;
const FINISHING_NO_EVENTS_TIMEOUT_MS = 4500;
const FINISHING_HARD_TIMEOUT_MS = 12000;

interface InputAudioTranscriptionDeltaEvent {
  type: "conversation.item.input_audio_transcription.delta";
  item_id: string;
  delta: string;
}

interface InputAudioTranscriptionCompletedEvent {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
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
  isRecording,
  maxLength,
}: {
  previousTranscript: string;
  transcriptSegments: TranscriptSegment[];
  isRecording: boolean;
  maxLength: number;
}): string {
  const transcriptText = transcriptSegments
    .map(segment => segment.text)
    .filter(text => text.trim().length > 0)
    .join(" ")
    .trim();
  const baseText = previousTranscript.trim();
  const combined = [baseText, transcriptText].filter(Boolean).join(" ");
  const hasEllipsisRoom = combined.length + 3 <= maxLength;
  const liveSuffix = isRecording && transcriptText && hasEllipsisRoom ? "..." : "";

  return `${combined}${liveSuffix}`.slice(0, maxLength);
}

export function scrollTextareaToBottom(textarea: HTMLTextAreaElement) {
  textarea.scrollTop = textarea.scrollHeight;
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
function HumanInput({ phase, isPanelist, currentSpeakerName, onSubmitHumanMessage, liveKey, isButtonMuseumMode = false }: HumanInputProps): React.ReactElement | null {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [canContinue, setCanContinue] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [previousTranscript, setPreviousTranscript] = useState<string>("");

  const inputArea = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef<string>("");
  const isMobile = useMobile();

  const connectionStateRef = useRef<ConnectionState>("idle");
  const inputAudioActiveRef = useRef<boolean>(false);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const finishingQuietTimerRef = useRef<number | null>(null);
  const finishingNoEventsTimerRef = useRef<number | null>(null);
  const finishingHardTimerRef = useRef<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  // PTT store subscriptions — skip re-subscribing in non-PTT builds.
  // rawPressed tracks the physical button state regardless of pttInputEnabled,
  // which lets us detect a held button even while pre-warming (LED off).
  const rawPressed = useMuseumButtonSelector(
    isButtonMuseumMode,
    (state) => state.rawPressed,
    false,
  );
  const setLedMode = useMuseumButtonSetLedMode(isButtonMuseumMode);

  // Mirror rawPressed in a ref so the connectionState-change effect can read
  // the current value without taking it as a dependency (avoids double-trigger).
  const rawPressedRef = useRef(rawPressed);

  // Set to true on PTT release so the state-change effect can auto-submit
  const autoSubmitAfterFinish = useRef(false);
  // Stable ref to the latest onSubmitHumanMessage callback (avoids stale effects)
  const onSubmitRef = useRef(onSubmitHumanMessage);

  const { t, i18n } = useTranslation();

  const maxInputLength = MAX_INPUT_LENGTH;

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    rawPressedRef.current = rawPressed;
  }, [rawPressed]);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useLayoutEffect(() => {
    if (!inputArea.current) return;
    scrollTextareaToBottom(inputArea.current);
  }, [inputValue]);

  // Auto-connect: fires on mount (idle) and reconnects if connection drops.
  useEffect(() => {
    if (connectionState === "idle") {
      void connect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Keep the submit callback ref fresh so PTT auto-submit never goes stale.
  useEffect(() => {
    onSubmitRef.current = onSubmitHumanMessage;
  }, [onSubmitHumanMessage]);

  // ── PTT × LED management ────────────────────────────────────────────────────

  // Claim PTT ownership for the lifetime of this mount; release on unmount.
  // This lets a future meta-agent know when HumanInput is active and should
  // back off. LED is set to "off" on unmount as part of the release.
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    const release = claimButton("human-input");
    return () => {
      void setLedMode("off");
      release();
    };
  // setLedMode is stable (Zustand); isButtonMuseumMode doesn't change during a meeting
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isButtonMuseumMode]);

  // Drive LED mode from connection state.
  // Pulse = "you can speak now" (active + ready only — warm phase cannot speak yet).
  // On    = "recording now".
  // Off   = transitional, warm, connecting, or finishing.
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    if (phase === "active" && connectionState === "ready") {
      void setLedMode("pulse");
    } else if (phase === "active" && connectionState === "recording") {
      void setLedMode("on");
    } else {
      void setLedMode("off");
    }
  }, [isButtonMuseumMode, phase, connectionState, setLedMode]);

  // PTT press → start recording (only when active; startRecording guards on "ready")
  // Uses rawPressed so a press during connecting is captured and can be acted upon
  // once the connection becomes ready (handled by the auto-start effect below).
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    if (rawPressed && phase === "active") {
      startRecording();
    }
  // startRecording uses refs; phase and rawPressed are the real triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPressed, isButtonMuseumMode, phase]);

  // PTT release → finish session + schedule auto-submit.
  // Uses rawPressed so a release is detected even if pressed was never set to
  // true (which happens when the button was held during a pre-warm connection).
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    if (!rawPressed && connectionStateRef.current === "recording") {
      autoSubmitAfterFinish.current = true;
      finishRealtimeSession();
    }
  // finishRealtimeSession uses refs; rawPressed is the real trigger
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPressed, isButtonMuseumMode]);

  // Auto-start: if the button is already physically held when the connection
  // transitions from connecting → ready, begin recording immediately without
  // requiring a release-and-repress cycle.
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    if (connectionState === "ready" && phase === "active" && rawPressedRef.current) {
      startRecording();
    }
  // rawPressedRef is intentionally read via ref to avoid double-triggering on
  // normal presses (rawPressed changing is already handled by the effect above)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, isButtonMuseumMode, phase]);

  // Auto-submit when finishing settles back to ready (after PTT release)
  useEffect(() => {
    if (!isButtonMuseumMode) return;
    if (connectionState === "ready" && autoSubmitAfterFinish.current) {
      autoSubmitAfterFinish.current = false;
      const text = inputValueRef.current.trim();
      if (text.length > 0) {
        onSubmitRef.current(inputValueRef.current.substring(0, maxInputLength));
        setInputValue("");
        setPreviousTranscript("");
        setTranscriptSegments([]);
        setCanContinue(false);
      }
    }
  // Runs only when connectionState changes; all payload read via stable refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, isButtonMuseumMode]);

  function handleRealtimeEvent(event: HumanInputRealtimeEvent) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      inputAudioActiveRef.current = true;
      setTranscriptSegments(prev => upsertTranscriptSegment(
        prev,
        event.item_id,
        `${prev.find(segment => segment.itemId === event.item_id)?.text ?? ""}${event.delta}`
      ));
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      inputAudioActiveRef.current = false;
      setTranscriptSegments(prev => upsertTranscriptSegment(prev, event.item_id, event.transcript));
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      inputAudioActiveRef.current = false;
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      inputAudioActiveRef.current = true;
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

    try {
      const bootstrap = await bootstrapHumanInputRealtimeSession(
        { feature: "human-input", language: i18n.language },
        liveKey,
        controller.signal
      );

      const sessionForDc = bootstrap.session;
      const providerForDc: RealtimeProvider = bootstrap.provider;

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
                } catch {
                  /* closed before send; ignore */
                }
              }
            : undefined,
        onRemoteTrack: () => undefined,
        onEvent: (event) => {
          if (isHumanInputRealtimeEvent(event)) {
            handleRealtimeEvent(event);
          }
        },
        onClose: () => {
          // Unexpected close — go to idle so the auto-connect effect re-fires.
          if (!controller.signal.aborted) {
            closeRealtimeConnection();
            setConnectionState("idle");
          }
        },
      });

      if (controller.signal.aborted) {
        connection.close();
        return;
      }

      // Gate the mic: track stays in the peer connection but sends no audio.
      // STT only bills on real audio, so this warm connection is free.
      connection.micStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      connectionRef.current = connection;
      setConnectionState("ready");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
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
    if (connectionStateRef.current !== "ready" || !connectionRef.current) return;
    clearFinishingTimers();
    inputAudioActiveRef.current = false;
    setTranscriptSegments([]);
    setPreviousTranscript(inputValueRef.current);
    connectionRef.current.micStream.getAudioTracks().forEach(track => {
      track.enabled = true;
    });
    setMicStream(connectionRef.current.micStream);
    connectionStateRef.current = "recording";
    setConnectionState("recording");
  }

  /**
   * Closes the mic gate and waits for the final transcript to settle before
   * returning to "ready". The connection stays open for a potential re-record.
   * Exposed as a standalone function so PTT can call it directly.
   */
  function finishRealtimeSession() {
    if (!connectionRef.current) {
      setConnectionState("idle");
      return;
    }

    connectionStateRef.current = "finishing";
    setConnectionState("finishing");
    connectionRef.current.micStream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    setMicStream(null);

    if (!inputAudioActiveRef.current) {
      setConnectionState("ready");
      return;
    }

    finishingNoEventsTimerRef.current = window.setTimeout(() => {
      setConnectionState("ready");
    }, FINISHING_NO_EVENTS_TIMEOUT_MS);
    finishingHardTimerRef.current = window.setTimeout(() => {
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
        isRecording: true,
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
        isRecording: false,
        maxLength: maxInputLength,
      });
      setInputValue(nextValue);
      updateCanContinue(nextValue);
    }
  // finishRealtimeSession is stable (no deps), safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    bottom: "0" + dvh,
    height: "65" + dvh,
    minHeight: "195px",
    zIndex: "0",
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle: React.CSSProperties = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    zIndex: "3",
    display: "flex",
    alignItems: "center"
  };

  const textStyle: TextareaStyle = {
    backgroundColor: "rgba(0,0,0,0.5)",
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
    ? t("human.button_museum")
    : isPanelist
      ? t("human.panelist", { name: currentSpeakerName })
      : t("human.1");

  return (<>
    <div style={wrapperStyle}>
      <img alt="Say something!" src={micIcon} style={micStyle} />
      <div style={{ zIndex: "4", position: "relative", pointerEvents: "auto" }}>
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
