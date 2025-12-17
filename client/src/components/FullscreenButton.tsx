// FullscreenButton.jsx
import { useState, useEffect } from "react";

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

  return (
    <div
      onClick={toggleFullscreen}
      style={styles.container}
    >
      {isFullscreen ? (
        <img
          src={'/icons/close_fullscreen.svg'}
          alt="Close fullscreen"
          style={styles.icon}
        />
      ) : (
        <img
          src={'/icons/fullscreen.svg'}
          alt="Open fullscreen"
          style={styles.icon}
        />
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: "fixed",
    bottom: "6px",
    right: "10px",
    opacity: 0.7,
    zIndex: 10,
    pointerEvents: "auto",
  },
  icon: { width: "35px", cursor: "pointer" },
};

export default FullscreenButton;
