import { useState, useEffect, useRef } from "react";
import ConversationControlIcon from "./ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';
import { useMobile, dvh } from "../utils";
import { useTranslation } from "react-i18next";
import { LiveAudioVisualizer } from 'react-audio-visualize';
import Lottie from 'react-lottie-player';
import loading from '../animations/loading.json';

/**
 * HumanInput Component
 * 
 * Manages the user interface for human participation, supporting both voice (OpenAI Realtime API) and text input.
 * 
 * Core Logic:
 * - **Voice Input**: Establishes a WebRTC connection to OpenAI ('startRealtimeSession') to stream audio and receive live transcripts.
 * - **Text Input**: Provides a fallback manual text entry.
 * - **Targeting**: Should allow selection of specific characters to address (logic partially implemented via `askParticular`).
 * 
 * @param {Object} props
 * @param {boolean} props.isPanelist - Mode flag: True if acting as a specific human panelist (interruption), False if general audience entry.
 * @param {string} props.currentSpeakerName - Context for placeholder text.
 * @param {Function} props.onSubmitHumanMessage - Callback to send final text to server.
 * @param {Object} props.socketRef - Socket reference for requesting client keys.
 */
function HumanInput({ isPanelist, currentSpeakerName, onSubmitHumanMessage, socketRef }) {
  const [clientKey, setClientKey] = useState(null);
  const [recordingState, setRecordingState] = useState("idle");
  const [canContinue, setCanContinue] = useState(false);
  const [transcript, setTranscript] = useState({});
  const [previousTranscript, setPreviousTranscript] = useState("");
  const [askParticular, setAskParticular] = useState("");
  const [someoneHovered, setSomeoneHovered] = useState(false);
  const inputArea = useRef(null);
  const isMobile = useMobile();

  const [mediaRecorder, setMediaRecorder] = useState(null);

  const initialized = useRef(false);
  const pc = useRef(null);
  const mic = useRef(null);

  const [rerender, forceRerender] = useState(false);
  const { t } = useTranslation();

  const maxInputLength = isPanelist ? 1300 : 700;

  // Effect to manage speech recognition state
  useEffect(() => {
    if (recordingState === 'loading' && clientKey) {
      setTranscript({});
      startRealtimeSession();
    } else if (recordingState === 'recording') {
      //do something here?
    } else if (recordingState === 'idle') {
      mediaRecorder?.stop();
      pc.current?.close();
      mic.current?.getTracks().forEach(track => track.stop());
    }
  }, [recordingState, clientKey]);

  /**
   * Initiates a WebRTC session with OpenAI's Realtime API.
   * - Captures local microphone stream.
   * - Negotiates SDP offer/answer.
   * - Listens for transcription completion events via Data Channel.
   */
  async function startRealtimeSession() {

    // Create a peer connection
    pc.current = new RTCPeerConnection();

    mic.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const recorder = new MediaRecorder(mic.current);
    recorder.start();
    setMediaRecorder(recorder);
    pc.current.addTrack(mic.current.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.current.createDataChannel("oai-events");

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientKey}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.current.setRemoteDescription(answer);

    dc.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      // Delta events are not working at the moment
      // https://community.openai.com/t/gpt-4o-transcribe-realtime-the-delta-updates-not-received-during-the-transcription/1357039
      // if (event.type === "conversation.item.input_audio_transcription.delta") {
      //   setTranscript(prev => {
      //     prev[event.item_id] = !prev[event.item_id] ? event.delta : prev[event.item_id] += event.delta;
      //     return {...prev};
      //   }
      //   );
      // }
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        setTranscript(prev => {
          prev[event.item_id] = event.transcript;
          return { ...prev };
        });
      }
    });

    setRecordingState('recording');
  }

  useEffect(() => {
    if (!initialized.current) {
      socketRef.current.emit('request_clientkey');
      initialized.current = true;
    }
    socketRef.current.on('clientkey_response', (data) => {
      setClientKey(data.value);
    });
    return () => {
      socketRef.current.off('clientkey_response');
      pc.current?.close();
      mic.current?.getTracks().forEach(track => track.stop());
    }
  }, []);

  function handleStartStopRecording() {
    if (recordingState === 'idle') {
      setRecordingState('loading'); // Toggle the recording state  
    } else {
      setRecordingState('idle');
    }
  }

  useEffect(() => {
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

  function inputFocused(e) {
    setRecordingState('idle');
  }

  function inputChanged(e) {
    if (inputArea.current.value.length > 0 && inputArea.current.value.trim().length !== 0) {
      setCanContinue(true);
    } else {
      setCanContinue(false);
    }
  }

  function checkEnter(e) {
    if (canContinue && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    onSubmitHumanMessage(inputArea.current.value.substring(0, maxInputLength), askParticular);
  }

  const wrapperStyle = {
    position: "absolute",
    bottom: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const micStyle = {
    position: "absolute",
    bottom: "0" + dvh,
    height: "65" + dvh,
    minHeight: "195px",
    zIndex: "0",
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    zIndex: "3",
    display: "flex",
    alignItems: "center"
  };

  const textStyle = {
    backgroundColor: "rgba(0,0,0,0.5)",
    width: "70vw",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile && "0",
    marginBottom: isMobile && "-8px",
    lineHeight: "1.1em",
    resize: "none",
    padding: "0",
  };

  //TODO implement ask partikular graphics

  return (<>
    <div style={wrapperStyle}>
      <img alt="Say something!" src="/mic.avif" style={micStyle} />
      <div style={{ zIndex: "4", position: "relative", pointerEvents: "auto" }}>
        <TextareaAutosize
          ref={inputArea}
          style={textStyle}
          onChange={inputChanged}
          onKeyDown={checkEnter}
          onFocus={inputFocused}
          className="unfocused"
          minRows="1"
          maxRows="6"
          cacheMeasurements={rerender}
          maxLength={maxInputLength}
          placeholder={isPanelist ? t('human.panelist', { name: currentSpeakerName }) : t("human.1")}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", pointerEvents: "auto", justifyContent: "center" }}>
        <div style={{ ...divStyle, transform: "scale(-1, -1)" }}>
          {recordingState === 'recording' && mediaRecorder && (
            <LiveAudioVisualizer
              mediaRecorder={mediaRecorder}
              width={100}
              height={40}
              barWidth={3}
              gap={2}
              barColor={'#ffffff'}
              smoothingTimeConstant={0.85}
            />
          )}
        </div>
        <div style={divStyle}>
          {recordingState === 'loading' &&
            <Lottie play loop animationData={loading} style={{ height: isMobile ? "45px" : "56px" }} />
          }
          {recordingState !== 'loading' &&
            <ConversationControlIcon
              icon={(recordingState === 'recording' ? "record_voice_on" : "record_voice_off")}
              onClick={handleStartStopRecording}
            />
          }
        </div>
        <div style={divStyle}>
          {recordingState === 'recording' && mediaRecorder && (
            <LiveAudioVisualizer
              mediaRecorder={mediaRecorder}
              width={100}
              height={40}
              barColor={'#ffffff'}
              barWidth={3}
              gap={2}
              smoothingTimeConstant={0.85}
            />
          )}
          {recordingState === 'idle' && canContinue &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={submitAndContinue}
            />
          }
        </div>
      </div>
    </div>
  </>
  );
}

export default HumanInput;
