import { useMobile, useMobileXs, usePortrait } from "../utils";

/**
 * OverlayWrapper Component
 *
 * A wrapper for overlay content that provides detailed layout control and a close button.
 * It is typically used *inside* the `Overlay` component.
 *
 * Core Logic:
 * - Provides a "Click to Dismiss" behavior by placing invisible click handlers around the content.
 * - Centers the content while adding responsive padding for mobile/desktop.
 * - Renders an optional "X" close button in the top-right corner.
 *
 * @param {Object} props
 * @param {boolean} props.showX - Whether to show the close "X" button.
 * @param {Function} props.removeOverlay - Callback function to close the overlay.
 * @param {React.ReactNode} props.children - The overlay content to wrap.
 */
interface OverlayWrapperProps {
  showX?: boolean;
  removeOverlay: () => void;
  children: React.ReactNode;
}

function OverlayWrapper({
  showX,
  removeOverlay,
  children
}: OverlayWrapperProps): React.ReactElement {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const isPortait = usePortrait();
  const closeUrl = `/icons/close.svg`;

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  const closeStyle: React.CSSProperties = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: isPortait ? "20px" : isMobile ? isMobileXs ? "40px" : "60px" : "100px",
    right: isPortait ? "20px" : isMobile ? isMobileXs ? "6px" : "15px" : "100px",
    zIndex: "20",
  };

  const clickerStyle: React.CSSProperties = {
    flex: 1,
  };

  const middleColumn: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflow: isMobile ? "auto" : undefined,
  };

  const closeWrapperStyle: React.CSSProperties = {
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  const closeInnerStyle: React.CSSProperties = {
    position: "absolute",
    height: (isMobile || isPortait) ? "100%" : "calc(100% - 60px)",
    width: "100%",
    display: "flex",
    marginTop: (isMobile || isPortait) ? "0" : "60px",
  };

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      <div style={closeWrapperStyle}>
        <div style={closeInnerStyle}>
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
          <div style={middleColumn}>
            <div
              style={clickerStyle}
              onClick={removeOverlay}
            />
            {children}
            <div
              style={clickerStyle}
              onClick={removeOverlay}
            />
          </div>
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
        </div>
      </div>
      {showX && (
        <img
          alt="close"
          src={closeUrl}
          style={closeStyle}
          onClick={removeOverlay}
        />
      )}
    </>
  );
}

export default OverlayWrapper;