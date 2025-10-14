// FullscreenButton.jsx
import React, { useState, useEffect } from "react";

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

  const toggleFullscreen = () => {
    const element = document.documentElement;
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
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        // Firefox
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        // Chrome, Safari and Opera
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        // IE/Edge
        document.msExitFullscreen();
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

const styles = {
  container: {
    position: "fixed",
    bottom: "6px",
    right: "10px",
    opacity: '0.7',
    zIndex: 10,
    pointerEvents: "auto",
  },
  icon: { width: "35px", cursor: "pointer" },
};

export default FullscreenButton;
