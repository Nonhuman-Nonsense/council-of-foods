import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useMobile } from "@/utils";

/**
 * The frame's corners, shared by everything that sits in them: the bottom bar's
 * corners and the global fullscreen button, so they line up and can't drift apart.
 *
 * - `inset` — distance from the frame's edges, and the gap between stacked icons.
 * - `size` — one corner icon's square.
 * - `width` — what a bottom bar corner reserves. Wider on a phone, where the mic's
 *   visualiser sits beside it, so the centre stays centred.
 * - `opacity` — corner controls are dimmed, to stay out of the way of the page.
 */
export function useCorner() {
  const isMobile = useMobile();
  return {
    inset: 6,
    size: isMobile ? 30 : 40,
    width: isMobile ? 64 : 40,
    opacity: 0.7,
  };
}

type BottomBarProps = {
  /**
   * - `overlay` — absolute at the bottom of the frame, over the page, and click-through
   *   except where its content takes clicks (the setup agent, the visitor's input).
   * - `footer` — the same row in the page's flow, filling its parent's width and
   *   owning its band, clicks included (the meeting's controls, which the shell's
   *   overlays stop above).
   */
  placement?: "overlay" | "footer";
  /** Stacked from the bottom-left corner upward. */
  left?: ReactNode;
  centre?: ReactNode;
  /** Stacked from the bottom-right corner upward. */
  right?: ReactNode;
  /**
   * A full-width row under the corners and the centre (the marquee banner): it
   * spans the screen, and when it rolls open everything above it moves up with it.
   */
  banner?: ReactNode;
  zIndex?: number;
};

/**
 * The bottom edge of the app frame — every screen's, setup and meeting alike: a
 * corner on each side and the centre between. Both corners always reserve their
 * width, so the centre is centred on the screen whatever is in them, and nothing in
 * it runs under the fullscreen button.
 *
 * As an overlay it is absolute, not fixed: below the frame's minimum height
 * (`.App`'s min-height) it stays at the bottom of the frame instead of riding up
 * over the page with the window.
 */
export default function BottomBar({ placement = "overlay", left, centre, right, banner, zIndex }: BottomBarProps): ReactElement {
  const corner = useCorner();

  const barStyle: CSSProperties = {
    ...(placement === "overlay"
      ? { position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "none" }
      : { position: "relative", width: "100%", flex: "0 0 auto", pointerEvents: "auto" }),
    zIndex,
    display: "flex",
    flexDirection: "column",
  };

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-end",
  };

  const cornerStyle = (align: "flex-start" | "flex-end"): CSSProperties => ({
    flex: `0 0 ${corner.width}px`,
    margin: `0 ${corner.inset}px ${corner.inset}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: align,
    gap: corner.inset,
    opacity: corner.opacity,
  });

  const centreStyle: CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  return (
    <div style={barStyle}>
      <div style={rowStyle}>
        <div style={cornerStyle("flex-start")}>{left}</div>
        <div style={centreStyle}>{centre}</div>
        <div style={cornerStyle("flex-end")}>{right}</div>
      </div>
      {banner}
    </div>
  );
}

/**
 * One icon in a corner: a fixed square, so nothing swapped into it (a spinner) can
 * resize the corner and shift its neighbours.
 */
export function CornerSlot({ children }: { children: ReactNode }): ReactElement {
  const { size } = useCorner();
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
}
