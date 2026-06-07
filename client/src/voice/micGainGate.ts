/**
 * Routes a getUserMedia stream through a Web Audio gain node before WebRTC.
 * The raw mic stays live while the gate is closed; only the gated stream is sent.
 */
export type MicGainGate = {
  /** Stream whose audio is gated for WebRTC. */
  gatedStream: MediaStream;
  setGateOpen: (open: boolean) => void;
  dispose: () => void;
};

export async function createMicGainGate(inputStream: MediaStream): Promise<MicGainGate> {
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(inputStream);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0;

  const destination = audioContext.createMediaStreamDestination();

  source.connect(gainNode);
  gainNode.connect(destination);

  let disposed = false;

  return {
    gatedStream: destination.stream,
    setGateOpen(open: boolean) {
      if (disposed) return;
      gainNode.gain.value = open ? 1 : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      try {
        gainNode.disconnect();
      } catch {
        /* ignore */
      }
      destination.stream.getTracks().forEach((track) => track.stop());
      inputStream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
    },
  };
}
