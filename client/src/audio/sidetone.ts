import { useEffect } from "react";
import { createAudioContext } from "./audioContext";

/**
 * Sidetone: the visitor hears their own voice in their headphones while they talk, the way a
 * radio studio monitors the mic.
 *
 * Every microphone the app opens is handed to {@link monitorMicrophone}. Push-to-talk gates
 * a mic by disabling its track, and a disabled track plays silence, so the visitor hears
 * themselves only while the button is held — nothing here needs to know about the button.
 * What they hear is the processed track the agents transcribe (noise suppression and all),
 * so staff listening in hear what the AI hears.
 *
 * On a context of its own rather than the shared bus, which is suspended while a meeting is
 * paused, when an agent may still be listening. The context exists only while the level is
 * above zero, so an install that never turns this on never builds one.
 *
 * Headphones only: played over speakers, the mic hears itself and howls.
 */
export type SidetoneSettings = {
  /** Gain, 0 (off) to 1 (the mic's own level). */
  level: number;
  /** Follow Split audio: on the right side only, where the voices are. */
  split: boolean;
};

const RIGHT = 1;

type Output = {
  ctx: AudioContext;
  gain: GainNode;
  /** Made on the first split, like the shared bus's. */
  merger: ChannelMergerNode | null;
  sources: Map<MediaStreamTrack, MediaStreamAudioSourceNode>;
};

let output: Output | null = null;
/**
 * Every live mic track, monitored or not, so turning the level up mid-session reaches a mic
 * that was opened before it — museum mode holds one open from connect.
 */
const tracks = new Set<MediaStreamTrack>();

/**
 * Forget tracks that have been stopped. A track stopped by the page fires no `ended` event,
 * so this runs whenever a mic is added or the settings change rather than waiting to hear.
 */
function pruneEnded(): void {
  for (const track of tracks) {
    if (track.readyState !== "ended") continue;
    tracks.delete(track);
    output?.sources.get(track)?.disconnect();
    output?.sources.delete(track);
  }
}

function route(out: Output, split: boolean): void {
  out.gain.disconnect();
  if (!split) {
    // A mono mic up-mixes to both ears.
    out.gain.connect(out.ctx.destination);
    return;
  }
  if (!out.merger) {
    out.merger = out.ctx.createChannelMerger(2);
    out.merger.connect(out.ctx.destination);
  }
  out.gain.connect(out.merger, 0, RIGHT);
}

function connect(out: Output, track: MediaStreamTrack): void {
  if (out.sources.has(track)) return;
  const source = out.ctx.createMediaStreamSource(new MediaStream([track]));
  source.connect(out.gain);
  out.sources.set(track, source);
}

function resume(out: Output): void {
  if (out.ctx.state === "suspended") void out.ctx.resume().catch(() => {});
}

function open(): Output {
  const ctx = createAudioContext();
  const out: Output = { ctx, gain: ctx.createGain(), merger: null, sources: new Map() };
  for (const track of tracks) connect(out, track);
  return out;
}

function close(out: Output): void {
  for (const source of out.sources.values()) source.disconnect();
  out.gain.disconnect();
  out.merger?.disconnect();
  if (out.ctx.state !== "closed") void out.ctx.close().catch(() => {});
}

/** Play this mic in the headphones whenever its track is enabled and the level is up. */
export function monitorMicrophone(stream: MediaStream): void {
  pruneEnded();
  for (const track of stream.getAudioTracks()) {
    tracks.add(track);
    if (output) connect(output, track);
  }
  if (output) resume(output);
}

/** Set the level and the split; a level of zero closes the output altogether. */
export function setSidetone(next: SidetoneSettings): void {
  pruneEnded();
  if (next.level <= 0) {
    if (output) close(output);
    output = null;
    return;
  }
  output ??= open();
  output.gain.gain.value = next.level;
  route(output, next.split);
  resume(output);
}

/** Keeps the sidetone at the staff level, on the side Split audio puts the voices (Main-owned). */
export function useSidetone(level: number, split: boolean): void {
  useEffect(() => {
    setSidetone({ level, split });
  }, [level, split]);
}
