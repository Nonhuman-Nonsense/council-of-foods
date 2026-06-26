import type { AudioUpdatePayload } from "@shared/SocketTypes";
import { useEffect, useRef } from "react";
import React from 'react';

// At runtime in the client, 'audio' has been decoded to AudioBuffer
// We extend the wire type to reflect the client-side reality
export interface PlayableAudioMessage extends Omit<AudioUpdatePayload, 'audio'> {
  audio?: AudioBuffer;
}

export interface PlaybackStartInfo {
  messageId: string;
  startedAtAudioContextTime: number;
}

interface AudioOutputMessageProps {
  currentAudioMessage: PlayableAudioMessage | null;
  audioContext: React.RefObject<AudioContext | null>;
  gainNode: React.RefObject<GainNode | null>;
  onFinishedPlaying: () => void;
  onPlaybackStarted?: (info: PlaybackStartInfo) => void;
}

function AudioOutputMessage({
  currentAudioMessage,
  audioContext,
  gainNode,
  onFinishedPlaying,
  onPlaybackStarted
}: AudioOutputMessageProps) {
  const sourceNode = useRef<AudioBufferSourceNode | null>(null);
  const onFinishedPlayingRef = useRef(onFinishedPlaying);
  const onPlaybackStartedRef = useRef(onPlaybackStarted);

  useEffect(() => {
    onFinishedPlayingRef.current = onFinishedPlaying;
    onPlaybackStartedRef.current = onPlaybackStarted;
  }, [onFinishedPlaying, onPlaybackStarted]);

  useEffect(() => {
    let ignoreEndEvent = false;

    // Handle updating the audio source when the message changes

    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.length !== 0) {
      function sourceFinished() {
        if (!ignoreEndEvent) {
          onFinishedPlayingRef.current();
        }
      }

      if (audioContext.current && gainNode.current) {
        sourceNode.current = audioContext.current.createBufferSource();
        sourceNode.current.buffer = currentAudioMessage.audio;

        sourceNode.current.connect(gainNode.current);
        const startedAtAudioContextTime = audioContext.current.currentTime;
        sourceNode.current.start();
        onPlaybackStartedRef.current?.({
          messageId: currentAudioMessage.id,
          startedAtAudioContextTime
        });
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
  }, [currentAudioMessage, audioContext, gainNode]);

  return null; // This component does not render anything itself
}

export default AudioOutputMessage;
