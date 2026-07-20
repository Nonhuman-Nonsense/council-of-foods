/**
 * Central stacking order for positioned UI. Higher values paint closer to the viewer.
 *
 * Prefer importing a named layer here over inline z-index values in components.
 * CSS classes use matching `--z-<key>` custom properties (see applyZIndexCssVariables).
 */
export const z = {
  background: -5,
  forestBackdrop: -3,
  backgroundZoomedOut: -2,
  backgroundZoomedIn: -1,
  /** Backdrop blur pseudo-element inside `.blur` overlays. */
  overlayBlurBackdrop: -1,
  contentBase: 0,
  councilMic: 0,
  gradientFooter: 1,
  councilSceneShade: 1,
  /** Council shell internal stacking — only meaningful within the council-shell stacking context (z routeOverlay). */
  councilShellBackdrop: 1,
  councilShellFooter: 2,
  councilShellContent: 3,
  marqueeBanner: 2,
  councilControls: 3,
  humanInputField: 4,
  realtimeCaption: 4,
  /** Main route shell (landing, setup, council). */
  routeOverlay: 5,
  overlayWrapper: 5,
  hamburgerBlocker: 9,
  navbar: 10,
  councilControlsRaised: 10,
  fullscreenButton: 10,
  /** Fixed bottom banners (replay marquee, PTT hint). */
  bottomBanner: 11,
  overlayCloseButton: 20,
  /** Blocking modals: autoplay warning, council error, reconnecting. */
  systemOverlay: 20,
  /** Staff-only overlays (e.g. #staff) that must appear above system error overlays. */
  staffOverlay: 25,
  rotatePrompt: 100,
  setupAgent: 10000,
  museumSwitchButton: 10001,
  buttonDebug: 10002,
} as const;

export type ZIndexLayer = keyof typeof z;

export type OverlayLayer = "route" | "system" | "staff";

export function overlayZIndex(layer: OverlayLayer = "route"): number {
  if (layer === "system") return z.systemOverlay;
  if (layer === "staff") return z.staffOverlay;
  return z.routeOverlay;
}

/** Publish stacking layers as CSS custom properties on `:root`. */
export function applyZIndexCssVariables(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  for (const [key, value] of Object.entries(z)) {
    root.style.setProperty(`--z-${key}`, String(value));
  }
}
