import { useState, useEffect, useRef } from "react";
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

type HumanInputRealtimeEvent =
  | InputAudioTranscriptionDeltaEvent
  | InputAudioTranscriptionCompletedEvent;

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
  const [recordingState, setRecordingState] = useState<"idle" | "loading" | "recording">("idle");
  const [canContinue, setCanContinue] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<Record<string, string>>({});
  const [previousTranscript, setPreviousTranscript] = useState<string>("");

  const inputArea = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobile();

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  const [rerender, forceRerender] = useState<boolean>(false);
  const { t, i18n } = useTranslation();

  const maxInputLength = isPanelist ? 1300 : 700;

  // Effect to manage speech recognition state
  useEffect(() => {
    if (recordingState === 'loading') {
      setTranscript({});
      void startRealtimeSession();
    } else if (recordingState === 'idle') {
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
      setMicStream(null);
    }
  }, [recordingState]);

  function handleRealtimeEvent(event: HumanInputRealtimeEvent) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      setTranscript(prev => {
        const next = { ...prev };
        next[event.item_id] = `${next[event.item_id] ?? ""}${event.delta}`;
        return next;
      });
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      setTranscript(prev => {
        const next = { ...prev };
        next[event.item_id] = event.transcript;
        return next;
      });
    }
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
        onEvent: (event) => handleRealtimeEvent(event as HumanInputRealtimeEvent),
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
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
      setMicStream(null);
    };
  }, []);

  function handleStartStopRecording() {
    if (recordingState === 'idle') {
      setRecordingState('loading'); // Toggle the recording state  
    } else {
      setRecordingState('idle');
    }
  }

  useEffect(() => {
    if (!inputArea.current) return;

    if (recordingState === 'loading') {
      setPreviousTranscript(inputArea.current.value);
    } else if (recordingState === 'recording') {
      //Completed order is not guaranteed, so we sort the result
      const sortedTranscript = Object.keys(transcript).sort().map(key => transcript[key]).join(" ") + "...";
      inputArea.current.value = (previousTranscript ? previousTranscript + " " + sortedTranscript : sortedTranscript).trim();

      // For some reason the textarea doesn't recalculate when the value is changed here
      // So we just flip a rerender variable and pass it to the component to trigger a react re-render
      forceRerender(r => !r);

      if (inputArea.current.value.length > maxInputLength) setRecordingState('idle');
    } else {
      const sortedTranscript = Object.keys(transcript).sort().map(key => transcript[key]).join(" ");
      inputArea.current.value = (previousTranscript ? previousTranscript + " " + sortedTranscript : sortedTranscript);
    }
    inputChanged();
  }, [transcript, recordingState]);

  function inputFocused(_e: React.FocusEvent) {
    setRecordingState('idle');
  }

  function inputChanged(_e?: React.ChangeEvent) {
    if (inputArea.current && inputArea.current.value.length > 0 && inputArea.current.value.trim().length !== 0) {
      setCanContinue(true);
    } else {
      setCanContinue(false);
    }
  }

  function checkEnter(e: React.KeyboardEvent) {
    if (canContinue && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    if (inputArea.current) {
      onSubmitHumanMessage(inputArea.current.value.substring(0, maxInputLength));
    }
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
          cacheMeasurements={rerender}
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
          {recordingState === 'loading' &&
            <Lottie play loop animationData={loading} style={{ height: isMobile ? 45 : 56 }} />
          }
          {recordingState !== 'loading' &&
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
