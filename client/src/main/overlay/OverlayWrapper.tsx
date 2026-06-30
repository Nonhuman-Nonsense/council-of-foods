import { useMobile, useMobileXs, usePortrait } from "@/utils";
import { Icons } from "@assets/icons";
import { z } from "@/zIndexLayers";

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
 * @param {Function} props.cancelOverlay - Callback function to close the overlay.
 * @param {React.ReactNode} props.children - The overlay content to wrap.
 */
interface OverlayWrapperProps {
  showX?: boolean;
  cancelOverlay: () => void;
  children: React.ReactNode;
  /**
   * When true, the content column stretches to fill the full available height
   * rather than being vertically centered. Use for overlays like Summary that
   * need to expand their scroll area to fill the main region.
   */
  fillHeight?: boolean;
}

const OverlayWrapper: React.FC<OverlayWrapperProps> = ({
  showX,
  cancelOverlay,
  children,
  fillHeight = false,
}) => {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const isPortait = usePortrait();


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
    zIndex: z.overlayCloseButton,
  };

  const clickerStyle: React.CSSProperties = {
    flex: 1,
  };

  const middleColumn: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    // In fillHeight mode:
    //   - alignSelf "stretch" is already the default in a flex-row container, so
    //     the column fills the container height without any extra property.
    //   - We do NOT add flex:1 here — that would split horizontal space equally
    //     with the left/right clickers and crush the 800px content width.
    //   - minHeight:0 + overflow:hidden let children use flex-grow correctly.
    // In default mode the centering clickers inside create vertical centering.
    ...(fillHeight
      ? { minHeight: 0, overflow: "hidden" }
      : { overflow: isMobile ? "auto" : undefined }),
  };

  const closeWrapperStyle: React.CSSProperties = {
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: z.overlayWrapper,
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
            onClick={cancelOverlay}
          />
          <div style={middleColumn}>
            {!fillHeight && (
              <div style={clickerStyle} onClick={cancelOverlay} />
            )}
            {children}
            {!fillHeight && (
              <div style={clickerStyle} onClick={cancelOverlay} />
            )}
          </div>
          <div
            style={clickerStyle}
            onClick={cancelOverlay}
          />
        </div>
      </div>
      {showX && (
        <Icons.close
          aria-label="close"
          style={closeStyle}
          onClick={cancelOverlay}
        />
      )}
    </>
  );
}

export default OverlayWrapper;