import React, { useState, useEffect } from "react";

function Overlay({ isActive, children }) {
  const [overlayStyle, setOverlayStyle] = useState({});

  useEffect(() => {
    if (isActive) {
      setOverlayStyle({
        position: "absolute",
        top: 0,
        left: 0,
        height: "100%",
        width: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      });
    } else {
      setOverlayStyle({
        position: "relative",
        top: 0,
        left: 0,
        height: "100%",
        width: "100%",
      });
    }
  }, [isActive]);

  return <div style={overlayStyle}>{children}</div>;
}

export default Overlay;
