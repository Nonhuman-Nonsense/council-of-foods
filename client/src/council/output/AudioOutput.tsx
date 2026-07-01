
import { useEffect, useRef } from "react";
import AudioOutputMessage, { PlayableAudioMessage, type PlaybackStartInfo } from "./AudioOutputMessage";
import React from 'react';

interface AudioOutputProps {
  audioContext: React.RefObject<AudioContext | null>;
  currentAudioMessage: PlayableAudioMessage | null;
  onFinishedPlaying: () => void;
  onPlaybackStarted?: (info: PlaybackStartInfo) => void;
  isMuted: boolean;
}

//Most of the audio processing should happen here, but the audioContext is owned higher up
//Because incoming audio needs to be processed directly on arrival
function AudioOutput({
  audioContext,
  currentAudioMessage,
  onFinishedPlaying,
  onPlaybackStarted,
  isMuted,
}: AudioOutputProps): React.ReactElement {
  const gainNode = useRef<GainNode | null>(null); //The general volume control node

  if (audioContext.current && gainNode.current === null) {
    gainNode.current = audioContext.current.createGain();
    gainNode.current.connect(audioContext.current.destination);
  }

  useEffect(() => {
    if (audioContext.current && gainNode.current) {
      if (isMuted) {
        gainNode.current.gain.setValueAtTime(
          0,
          audioContext.current.currentTime
        );
      } else {
        gainNode.current.gain.setValueAtTime(
          1,
          audioContext.current.currentTime
        );
      }
    }
  }, [isMuted]);

  return (
    <AudioOutputMessage
      currentAudioMessage={currentAudioMessage}
      audioContext={audioContext}
      gainNode={gainNode}
      onFinishedPlaying={onFinishedPlaying}
      onPlaybackStarted={onPlaybackStarted}
    />
  );
}

export default AudioOutput;
