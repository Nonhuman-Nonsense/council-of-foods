import type { AudioUpdatePayload } from "@shared/SocketTypes";
import type { Sentence } from "@shared/ModelTypes";
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
  /**
   * Hold playback (e.g. while the meta agent has interrupted the meeting).
   * Releasing the hold resumes the same message from the start of the
   * sentence it was interrupted in, rather than from the beginning.
   */
  held?: boolean;
}

/**
 * Where to resume after `elapsed` seconds of playback: the start of the
 * sentence playing at that moment, so the listener hears it whole again.
 */
export function resumeOffsetFor(sentences: Sentence[] | undefined, elapsed: number): number {
  if (!sentences || sentences.length === 0) return elapsed;
  let offset = 0;
  for (const sentence of sentences) {
    if (sentence.start > elapsed) break;
    offset = sentence.start;
  }
  return offset;
}

function AudioOutputMessage({
  currentAudioMessage,
  audioContext,
  gainNode,
  onFinishedPlaying,
  onPlaybackStarted,
  held = false,
}: AudioOutputMessageProps) {
  // Where the current message picks up when (re)started — 0 until a hold interrupts it.
  const resumePoint = useRef<{ messageId: string; offset: number } | null>(null);
  const onFinishedPlayingRef = useRef(onFinishedPlaying);
  const onPlaybackStartedRef = useRef(onPlaybackStarted);

  useEffect(() => {
    onFinishedPlayingRef.current = onFinishedPlaying;
    onPlaybackStartedRef.current = onPlaybackStarted;
  }, [onFinishedPlaying, onPlaybackStarted]);

  useEffect(() => {
    let ignoreEndEvent = false;

    function sourceFinished() {
      if (!ignoreEndEvent) {
        onFinishedPlayingRef.current();
      }
    }

    // Handle updating the audio source when the message changes or the hold toggles

    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.length !== 0) {
      if (resumePoint.current?.messageId !== currentAudioMessage.id) {
        resumePoint.current = { messageId: currentAudioMessage.id, offset: 0 };
      }
      const context = audioContext.current;
      if (!held && context && gainNode.current) {
        const offset = resumePoint.current.offset;
        const source = context.createBufferSource();
        source.buffer = currentAudioMessage.audio;

        source.connect(gainNode.current);
        // Backdated by the offset, so subtitle timing measured from it lines up with the audio.
        const startedAtAudioContextTime = context.currentTime - offset;
        source.start(0, offset);
        onPlaybackStartedRef.current?.({
          messageId: currentAudioMessage.id,
          startedAtAudioContextTime
        });
        source.addEventListener('ended', sourceFinished, true);

        const { id, sentences } = currentAudioMessage;
        return () => {
          ignoreEndEvent = true;
          resumePoint.current = {
            messageId: id,
            offset: resumeOffsetFor(sentences, context.currentTime - startedAtAudioContextTime),
          };
          source.removeEventListener('ended', sourceFinished, true);
          source.stop();
          source.disconnect();
        };
      }
    }
  }, [currentAudioMessage, held, audioContext, gainNode]);

  return null; // This component does not render anything itself
}

export default AudioOutputMessage;
