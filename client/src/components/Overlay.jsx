import React, { useState, useEffect } from "react";

function Overlay({ isActive, children }) {
  const [overlayStyle, setOverlayStyle] = useState({});

  useEffect(() => {
    if (isActive) {
      setOverlayStyle({
        position: "fixed",
        top: 0,
        left: 0,
        height: "100%",
        width: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        pointerEvents: "auto",
      });
    } else {
      setOverlayStyle({
        position: "fixed",
        top: 0,
        left: 0,
        height: "100%",
        width: "100%",
        pointerEvents: "none",
      });
    }
  }, [isActive]);

  return <div style={overlayStyle}>{children}</div>;
}

export default Overlay;
