import React, { useState, useEffect } from "react";

function Overlay({ isActive, isBlurred, children }) {
  const [overlayStyle, setOverlayStyle] = useState({});

  const sharedOverlayStyle = {
    position: "absolute",
    minHeight: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  useEffect(() => {
    if (isActive) {
      setOverlayStyle({
        ...sharedOverlayStyle,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        pointerEvents: "auto",
      });
    } else {
      setOverlayStyle({
        ...sharedOverlayStyle,
        pointerEvents: "none",
      });
    }
  }, [isActive, isBlurred]);

  return <div style={overlayStyle} className={isBlurred !== false && isActive === true ? "blur" : ""}>{children}</div>;
}

export default Overlay;
