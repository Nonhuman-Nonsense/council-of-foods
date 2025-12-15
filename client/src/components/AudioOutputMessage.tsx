import { useEffect, useRef, MutableRefObject } from "react";
import { AudioUpdatePayload } from "@shared/SocketTypes";

interface AudioOutputMessageProps {
    currentAudioMessage: AudioUpdatePayload | undefined;
    audioContext: MutableRefObject<AudioContext | null>;
    gainNode: MutableRefObject<GainNode | null>;
    onFinishedPlaying: () => void;
}

function AudioOutputMessage({ currentAudioMessage, audioContext, gainNode, onFinishedPlaying }: AudioOutputMessageProps): null {
    const sourceNode = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        let ignoreEndEvent = false;

        // Handle updating the audio source when the message changes

        if (currentAudioMessage && currentAudioMessage.audio && (currentAudioMessage.audio as any).length !== 0) {
            // Note: currentAudioMessage.audio comes as Buffer from server but client converts it to AudioBuffer.
            // We assume it's AudioBuffer here if it has length property that isn't 0 in the way checked?
            // Actually audioContext.decodeAudioData returns AudioBuffer.

            const sourceFinished = () => {
                if (!ignoreEndEvent) {
                    onFinishedPlaying();
                }
            }

            if (audioContext.current && gainNode.current) {
                sourceNode.current = audioContext.current.createBufferSource();
                // We need to cast because the shared type says Buffer, but on client it's decoded to AudioBuffer
                sourceNode.current.buffer = currentAudioMessage.audio as unknown as AudioBuffer;

                sourceNode.current.connect(gainNode.current);
                sourceNode.current.start();
                sourceNode.current.addEventListener('ended', sourceFinished as EventListener, true);
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
