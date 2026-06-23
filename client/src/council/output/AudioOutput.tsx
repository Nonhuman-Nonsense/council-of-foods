
import { useEffect, useRef } from "react";
import AudioOutputMessage, { PlayableAudioMessage, type PlaybackStartInfo } from "./AudioOutputMessage";
import React from 'react';

interface AudioOutputProps {
  meetingAudioContext: React.RefObject<AudioContext | null>;
  currentAudioMessage: PlayableAudioMessage | null;
  onFinishedPlaying: () => void;
  onPlaybackStarted?: (info: PlaybackStartInfo) => void;
  isMuted: boolean;
}

//Most of the audio processing should happen here, but the meetingAudioContext is owned higher up
//Because incoming audio needs to be processed directly on arrival
function AudioOutput({
  meetingAudioContext,
  currentAudioMessage,
  onFinishedPlaying,
  onPlaybackStarted,
  isMuted,
}: AudioOutputProps): React.ReactElement {
  const gainNode = useRef<GainNode | null>(null); //The general volume control node

  if (meetingAudioContext.current && gainNode.current === null) {
    gainNode.current = meetingAudioContext.current.createGain();
    gainNode.current.connect(meetingAudioContext.current.destination);
  }

  useEffect(() => {
    if (meetingAudioContext.current && gainNode.current) {
      if (isMuted) {
        gainNode.current.gain.setValueAtTime(
          0,
          meetingAudioContext.current.currentTime
        );
      } else {
        gainNode.current.gain.setValueAtTime(
          1,
          meetingAudioContext.current.currentTime
        );
      }
    }
  }, [isMuted]);

  return (
    <AudioOutputMessage
      currentAudioMessage={currentAudioMessage}
      meetingAudioContext={meetingAudioContext}
      gainNode={gainNode}
      onFinishedPlaying={onFinishedPlaying}
      onPlaybackStarted={onPlaybackStarted}
    />
  );
}

export default AudioOutput;
