import type { AudioUpdatePayload } from "@shared/SocketTypes";
import React, { useEffect, useRef } from 'react';

// At runtime in the client, 'audio' has been decoded to AudioBuffer
// We extend the wire type to reflect the client-side reality
export interface PlayableAudioMessage extends Omit<AudioUpdatePayload, 'audio'> {
  audio?: AudioBuffer;
}

interface AudioOutputMessageProps {
  currentAudioMessage: PlayableAudioMessage | null;
  audioContext: React.MutableRefObject<AudioContext | null>;
  gainNode: React.MutableRefObject<GainNode | null>;
  onFinishedPlaying: () => void;
}

function AudioOutputMessage({ currentAudioMessage, audioContext, gainNode, onFinishedPlaying }: AudioOutputMessageProps) {
  const sourceNode = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let ignoreEndEvent = false;

    // Handle updating the audio source when the message changes

    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.length !== 0) {
      function sourceFinished() {
        if (!ignoreEndEvent) {
          onFinishedPlaying();
        }
      }

      if (audioContext.current && gainNode.current) {
        sourceNode.current = audioContext.current.createBufferSource();
        sourceNode.current.buffer = currentAudioMessage.audio;

        sourceNode.current.connect(gainNode.current);
        sourceNode.current.start();
        sourceNode.current.addEventListener('ended', sourceFinished, true);
      }
    }

    return () => {
      ignoreEndEvent = true;
      sourceNode.current?.stop();
      sourceNode.current?.disconnect();
      // sourceNode.current?.close();
      // sourceNode.current = null;
    }
  }, [currentAudioMessage]);

  return null; // This component does not render anything itself
}

export default AudioOutputMessage;
