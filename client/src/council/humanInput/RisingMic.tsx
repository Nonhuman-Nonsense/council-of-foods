import type { CSSProperties, ReactElement } from "react";
import { dvh } from "@/utils";
import { z } from "@/zIndexLayers";
import micIcon from "@assets/mic.avif";

const micStyle: CSSProperties = {
  position: "absolute",
  bottom: `-${2}${dvh}`,
  height: `${45}${dvh}`,
  minHeight: "135px",
  zIndex: z.councilMic,
  animation: "4s micAppearing",
  animationFillMode: "both",
};

/**
 * The large microphone that rises from the bottom of the screen when it is the
 * visitor's turn to speak — a human turn, or the meta-agent waiting on them.
 */
export default function RisingMic(): ReactElement {
  return <img alt="Say something!" src={micIcon} style={micStyle} data-testid="rising-mic" />;
}
