import { useState, useEffect } from "react";
import { Icons } from "@assets/icons";
import { z } from "@/zIndexLayers";
import { useCorner } from "./BottomBar";

/**
 * FullscreenButton Component
 * 
 * A fixed-position button that toggles browser fullscreen mode.
 * Handles cross-browser fullscreen APIs (webkit, moz, ms).
 * 
 * Core Logic:
 * - Listens for `fullscreenchange` events to sync local state.
 * - Uses vendor-prefixed methods to request/exit fullscreen.
 */
const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const corner = useCorner();

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  useEffect(() => {
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Interfaces for vendor-prefixed fullscreen methods
  interface VendorFullscreenElement extends HTMLElement {
    mozRequestFullScreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  }

  interface VendorDocument extends Document {
    mozCancelFullScreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  }

  const toggleFullscreen = () => {
    const element = document.documentElement as VendorFullscreenElement;
    if (!document.fullscreenElement) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.mozRequestFullScreen) {
        // Firefox
        element.mozRequestFullScreen();
      } else if (element.webkitRequestFullscreen) {
        // Chrome, Safari and Opera
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        // IE/Edge
        element.msRequestFullscreen();
      }
    } else {
      const doc = document as VendorDocument;
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        // Firefox
        doc.mozCancelFullScreen();
      } else if (doc.webkitExitFullscreen) {
        // Chrome, Safari and Opera
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        // IE/Edge
        doc.msExitFullscreen();
      }
    }
  };

  const iconStyle = { width: corner.size - 5, height: corner.size - 5 };

  return (
    // Absolute in the frame, not fixed to the window, and placed from the same
    // corner as the bottom bar's: below the frame's minimum height it stays in
    // the frame's corner instead of riding up with the window.
    <div
      onClick={toggleFullscreen}
      style={{
        position: "absolute",
        right: corner.inset,
        bottom: corner.inset,
        width: corner.size,
        height: corner.size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: corner.opacity,
        zIndex: z.fullscreenButton,
        pointerEvents: "auto",
      }}
    >
      {isFullscreen ? (
        <Icons.close_fullscreen
          aria-label="Close fullscreen"
          style={iconStyle}
        />
      ) : (
        <Icons.fullscreen
          aria-label="Open fullscreen"
          style={iconStyle}
        />
      )}
    </div>
  );
};


export default FullscreenButton;
