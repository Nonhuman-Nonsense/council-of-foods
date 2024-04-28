import React, { useEffect, useRef, useCallback } from "react";

function AudioOutput({ currentAudioMessage, onFinishedPlaying, isMuted }) {
  const audioRef = useRef(null);//The Audiocontext object
  const gainNode = useRef(null);//The general volume control node
  //Since we will ever only have one person speaking at a time, we can keep a ref to it
  const sourceNode = useRef(null);

  useEffect(() => {
    if(audioRef.current){
      if(isMuted){
        gainNode.current.gain.setValueAtTime(0, audioRef.current.currentTime);
      }else{
        gainNode.current.gain.setValueAtTime(1, audioRef.current.currentTime);
      }
    }
  }, [isMuted]);

  useEffect(() => {
    // Initialize the audio element if it does not exist
    // Or if it is closed
    if (!audioRef.current || audioRef.current.state == "closed") {
      audioRef.current = new AudioContext();
      //Add a gain node on the first step, so that we can control mute/unmute
      gainNode.current = audioRef.current.createGain();
      gainNode.current.connect(audioRef.current.destination);
    }
    return () => {
      // Clean up audio element
      if(audioRef.current && audioRef.current.state == "running"){
        audioRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Handle updating the audio source when the message changes
    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.byteLength != 0) {
      console.log(currentAudioMessage);
      //If something is already playing, stop it
      if(sourceNode.current){
        //Stop any event listeners from executing further
        sourceNode.current.removeEventListener('ended',sourceFinished, true);
        //Then manually stop
        sourceNode.current.stop();
      }
      (async () => {
        //Create a new buffer source and connect it to the context
        const buffer = await audioRef.current.decodeAudioData(currentAudioMessage.audio);
        sourceNode.current = audioRef.current.createBufferSource();
        sourceNode.current.buffer = buffer;

        sourceNode.current.connect(gainNode.current);
        sourceNode.current.start();
        sourceNode.current.addEventListener('ended',sourceFinished, true);
      })();
    }
  }, [currentAudioMessage]);

  //This event is fired every time a source finishes
  //We use the useCallback to mark it as s function that persists between renders
  //Otherwise the event handler can not be removed
  const sourceFinished = useCallback(() => {
    onFinishedPlaying();
  },[]);

  return null; // This component does not render anything itself
}

export default AudioOutput;
