import React, { useEffect, useRef, useCallback } from "react";

function AudioOutputMessage({ currentAudioMessage, audioContext, gainNode, onFinishedPlaying }) {
  const sourceNode = useRef(null);

  useEffect(() => {
    let ignoreEndEvent = false;

    // Handle updating the audio source when the message changes
    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.byteLength != 0) {
      //If something is already playing, stop it

      function sourceFinished(){
        if(!ignoreEndEvent){
          onFinishedPlaying();
        }
      }

      (async () => {
        //Create a new buffer source and connect it to the context
        const buffer = await audioContext.current.decodeAudioData(currentAudioMessage.audio);
        sourceNode.current = audioContext.current.createBufferSource();
        sourceNode.current.buffer = buffer;

        sourceNode.current.connect(gainNode.current);
        sourceNode.current.start();
        sourceNode.current.addEventListener('ended',sourceFinished, true);
      })();
    }

    return () => {
      ignoreEndEvent = true;
      sourceNode.current?.stop();
    }
  }, [currentAudioMessage]);

  return null; // This component does not render anything itself
}

export default AudioOutputMessage;
