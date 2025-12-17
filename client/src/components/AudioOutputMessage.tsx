import { useEffect, useRef } from "react";

function AudioOutputMessage({ currentAudioMessage, audioContext, gainNode, onFinishedPlaying }) {
  const sourceNode = useRef(null);

  useEffect(() => {
    let ignoreEndEvent = false;

    // Handle updating the audio source when the message changes

    if (currentAudioMessage && currentAudioMessage.audio && currentAudioMessage.audio.length !== 0) {
      function sourceFinished(){
        if(!ignoreEndEvent){
          onFinishedPlaying();
        }
      }

      sourceNode.current = audioContext.current.createBufferSource();
      sourceNode.current.buffer = currentAudioMessage.audio;

      sourceNode.current.connect(gainNode.current);
      sourceNode.current.start();
      sourceNode.current.addEventListener('ended',sourceFinished, true);
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
