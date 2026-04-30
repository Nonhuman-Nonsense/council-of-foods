interface OverlayProps {
  isActive: boolean;
  isBlurred?: boolean; // JSDoc says boolean but code checks !== false. optional?
  children: React.ReactNode;
}

/**
 * Overlay Component
 *
 * A generic full-screen overlay container.
 * It handles the positioning, background dimming (backdrop), and blur effects.
 *
 * Core Logic:
 * - Uses `isActive` to toggle pointer events and background visibility.
 * - Uses `isBlurred` to apply a backdrop-filter blur via CSS class.
 *
 * @param {Object} props
 * @param {boolean} props.isActive - Whether the overlay is currently visible/interactive.
 * @param {boolean} props.isBlurred - Whether to apply a blur effect to the background.
 * @param {React.ReactNode} props.children - The content to display inside the overlay.
 */
function Overlay({ isActive, isBlurred, children }: OverlayProps) {

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    minHeight: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
    backgroundColor: isActive ? "rgba(0, 0, 0, 0.5)" : undefined,
    pointerEvents: isActive ? "auto" : "none",
  };

  return <div style={overlayStyle} className={isBlurred !== false && isActive === true ? "blur" : "blur hide"}>{children}</div>;
}

export default Overlay;
