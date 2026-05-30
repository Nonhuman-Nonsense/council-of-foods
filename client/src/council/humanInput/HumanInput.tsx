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

type HumanInputRealtimeEvent =
  | InputAudioTranscriptionDeltaEvent
  | InputAudioTranscriptionCompletedEvent
  | InputAudioBufferSpeechStoppedEvent;

type RecordingState = "idle" | "loading" | "recording" | "finishing";

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
    type === "input_audio_buffer.speech_stopped"
  );
}

interface HumanInputProps {
  isPanelist: boolean;
  currentSpeakerName: string;
  onSubmitHumanMessage: (text: string) => void;
  liveKey: string;
}

// Workaround for TextareaAutosize strict height type
type TextareaStyle = Omit<React.CSSProperties, 'height'> & { height?: number };

/**
 * HumanInput Component
 * 
 * Manages the user interface for human participation, supporting both voice and text input.
 * 
 * Core Logic:
 * - **Voice Input**: Opens a server-proxied realtime WebRTC session and receives live transcript deltas/finals.
 *   For Inworld WebRTC, the session is mirrored with `session.update` on the data channel when it opens (per docs),
 *   in addition to the payload on `/api/realtime/call`.
 * - **Text Input**: Provides a fallback manual text entry.
 * - **Routing**: The server infers whether the human is addressing a specific character.
 */
function HumanInput({ isPanelist, currentSpeakerName, onSubmitHumanMessage, liveKey }: HumanInputProps): React.ReactElement {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [canContinue, setCanContinue] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [previousTranscript, setPreviousTranscript] = useState<string>("");

  const inputArea = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef<string>("");
  const isMobile = useMobile();

  const recordingStateRef = useRef<RecordingState>("idle");
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const finishingQuietTimerRef = useRef<number | null>(null);
  const finishingNoEventsTimerRef = useRef<number | null>(null);
  const finishingHardTimerRef = useRef<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  const { t, i18n } = useTranslation();

  const maxInputLength = MAX_INPUT_LENGTH;

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useLayoutEffect(() => {
    if (!inputArea.current) return;
    scrollTextareaToBottom(inputArea.current);
  }, [inputValue]);

  // Effect to manage speech recognition state
  useEffect(() => {
    if (recordingState === 'loading') {
      clearFinishingTimers();
      setTranscriptSegments([]);
      void startRealtimeSession();
    } else if (recordingState === 'idle') {
      clearFinishingTimers();
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
      setMicStream(null);
    }
  }, [recordingState]);

  function handleRealtimeEvent(event: HumanInputRealtimeEvent) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      setTranscriptSegments(prev => upsertTranscriptSegment(
        prev,
        event.item_id,
        `${prev.find(segment => segment.itemId === event.item_id)?.text ?? ""}${event.delta}`
      ));
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      setTranscriptSegments(prev => upsertTranscriptSegment(prev, event.item_id, event.transcript));
      scheduleFinishingQuietClose();
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      scheduleFinishingQuietClose();
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

  function finishRealtimeSession() {
    if (!connectionRef.current) {
      setRecordingState("idle");
      return;
    }

    recordingStateRef.current = "finishing";
    setRecordingState("finishing");
    connectionRef.current.micStream.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    setMicStream(null);
    finishingNoEventsTimerRef.current = window.setTimeout(() => {
      closeRealtimeConnection();
      setRecordingState("idle");
    }, FINISHING_NO_EVENTS_TIMEOUT_MS);
    finishingHardTimerRef.current = window.setTimeout(() => {
      closeRealtimeConnection();
      setRecordingState("idle");
    }, FINISHING_HARD_TIMEOUT_MS);
  }

  function scheduleFinishingQuietClose() {
    if (recordingStateRef.current !== "finishing") return;

    if (finishingNoEventsTimerRef.current !== null) {
      window.clearTimeout(finishingNoEventsTimerRef.current);
      finishingNoEventsTimerRef.current = null;
    }

    if (finishingQuietTimerRef.current !== null) {
      window.clearTimeout(finishingQuietTimerRef.current);
    }

    finishingQuietTimerRef.current = window.setTimeout(() => {
      closeRealtimeConnection();
      setRecordingState("idle");
    }, FINISHING_QUIET_MS);
  }

  /**
   * Initiates a provider-backed realtime transcription session via the app server.
   */
  async function startRealtimeSession() {
    const controller = new AbortController();
    startAbortRef.current?.abort();
    startAbortRef.current = controller;

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
          if (!controller.signal.aborted) {
            setRecordingState("idle");
          }
        },
      });

      if (controller.signal.aborted) {
        connection.close();
        return;
      }

      connectionRef.current = connection;
      setMicStream(connection.micStream);
      setRecordingState('recording');
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("Failed to start realtime human input session", err);
      setRecordingState("idle");
    } finally {
      if (startAbortRef.current === controller) {
        startAbortRef.current = null;
      }
    }
  }

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

  function handleStartStopRecording() {
    if (recordingState === 'idle') {
      if (inputValue.length >= maxInputLength) {
        setCanContinue(true);
        return;
      }
      setRecordingState('loading'); // Toggle the recording state  
    } else if (recordingState === 'recording') {
      finishRealtimeSession();
    } else if (recordingState === 'loading') {
      setRecordingState('idle');
    }
  }

  useEffect(() => {
    if (recordingState === 'loading') {
      setPreviousTranscript(inputValueRef.current);
    } else if (recordingState === 'recording') {
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
        setRecordingState('idle');
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
  }, [transcriptSegments, recordingState, previousTranscript, maxInputLength]);

  function inputFocused(_e: React.FocusEvent) {
    if (recordingState === "recording") {
      finishRealtimeSession();
    } else if (recordingState === "loading") {
      setRecordingState("idle");
    }
  }

  function updateCanContinue(value: string) {
    setCanContinue(value.length > 0 && value.trim().length !== 0);
  }

  function inputChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    setInputValue(nextValue);
    updateCanContinue(nextValue);
  }

  function checkEnter(e: React.KeyboardEvent) {
    if (recordingState === "idle" && canContinue && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    if (recordingState !== "idle") return;

    onSubmitHumanMessage(inputValue.substring(0, maxInputLength));
    setInputValue("");
    setPreviousTranscript("");
    setTranscriptSegments([]);
    setRecordingState("idle");
    setCanContinue(false);
  }

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
  const isWaitingForRealtime = recordingState === 'loading' || recordingState === 'finishing';

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
          placeholder={isPanelist ? t('human.panelist', { name: currentSpeakerName }) : t("human.1")}
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
          {!isWaitingForRealtime &&
            <ConversationControlIcon
              icon={(recordingState === 'recording' ? "record_voice_on" : "record_voice_off")}
              onClick={handleStartStopRecording}
            />
          }
        </div>
        <div style={divStyle} ref={vizRightHostRef}>
          {recordingState === 'idle' && canContinue &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={submitAndContinue}
            />
          }
        </div>
        {recordingState === 'recording' && micStream && (
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
  </>
  );
}

export default HumanInput;
