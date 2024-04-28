import React, { useEffect, useRef, useCallback } from "react";
import AudioOutputMessage from "./AudioOutputMessage";

function AudioOutput({ currentAudioMessage, onFinishedPlaying, isMuted }) {
  const audioContext = useRef(null);//The Audiocontext object
  const gainNode = useRef(null);//The general volume control node

  useEffect(() => {
    if(audioContext.current){
      if(isMuted){
        gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
      }else{
        gainNode.current.gain.setValueAtTime(1, audioContext.current.currentTime);
      }
    }
  }, [isMuted]);

  useEffect(() => {
    // Initialize the audio element if it does not exist
    // Or if it is closed
    if (!audioContext.current || audioContext.current.state == "closed") {
      audioContext.current = new AudioContext();
      //Add a gain node on the first step, so that we can control mute/unmute
      gainNode.current = audioContext.current.createGain();
      gainNode.current.connect(audioContext.current.destination);
    }
    return () => {
      // Clean up audio element
      if(audioContext.current && audioContext.current.state == "running"){
        audioContext.current.close();
      }
    };
  }, []);

  return (
    <AudioOutputMessage currentAudioMessage={currentAudioMessage} audioContext={audioContext} gainNode={gainNode} onFinishedPlaying={onFinishedPlaying} />
  );
}

export default AudioOutput;
