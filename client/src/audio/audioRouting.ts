import { useEffect } from "react";
import type { AudioContextRef } from "./audioContext";

/**
 * Where each kind of sound joins the shared audio bus, so an installation can send the scene
 * and the voices to different places.
 *
 * Unsplit, both buses play straight to the output, as one stereo mix. Split, the output's two
 * channels become two mono feeds for a Y-cable: the left carries the scene alone, the right the
 * scene and the voices — a room that hears the forest without the talk, beside one that hears
 * the whole meeting. The realtime agents play through their own `<audio>` element, outside this
 * bus, so they stay on both sides.
 */
export type AudioBuses = {
  /** Scene sound: the ambience bed and the beings' loops. */
  scene: GainNode;
  /** The council's spoken voices. */
  voices: GainNode;
};

type Routing = AudioBuses & {
  ctx: AudioContext;
  /** Made on the first split, so an install that never splits never builds one. */
  merger: ChannelMergerNode | null;
};

const LEFT = 0;
const RIGHT = 1;

const routings = new WeakMap<AudioContext, Routing>();

function route(routing: Routing, split: boolean): void {
  const { ctx, scene, voices } = routing;
  scene.disconnect();
  voices.disconnect();

  if (!split) {
    scene.connect(ctx.destination);
    voices.connect(ctx.destination);
    return;
  }

  if (!routing.merger) {
    // A merger input is one channel, so a stereo bed is folded to mono on each side.
    routing.merger = ctx.createChannelMerger(2);
    routing.merger.connect(ctx.destination);
  }
  scene.connect(routing.merger, 0, LEFT);
  scene.connect(routing.merger, 0, RIGHT);
  voices.connect(routing.merger, 0, RIGHT);
}

/** The buses on this context, made unsplit the first time anything asks for them. */
export function audioBusesFor(ctx: AudioContext): AudioBuses {
  let routing = routings.get(ctx);
  if (!routing) {
    routing = { ctx, scene: ctx.createGain(), voices: ctx.createGain(), merger: null };
    route(routing, false);
    routings.set(ctx, routing);
  }
  return routing;
}

/** Split the output into a scene-only left and a full-mix right, or join it back. */
export function setAudioSplit(ctx: AudioContext, split: boolean): void {
  // Nothing has played yet, and the buses start unsplit when something does.
  if (!split && !routings.has(ctx)) return;
  audioBusesFor(ctx);
  route(routings.get(ctx)!, split);
}

/** Keeps the shared audio bus split while `split` is true (Main-owned). */
export function useAudioSplit(audioContext: AudioContextRef, split: boolean): void {
  useEffect(() => {
    const ctx = audioContext.current;
    if (ctx) setAudioSplit(ctx, split);
  }, [audioContext, split]);
}
