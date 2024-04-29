import React, { useState, useEffect } from "react";

function Overlay({ isActive, children }) {
  const [overlayStyle, setOverlayStyle] = useState({});

  const sharedOverlayStyle ={
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  useEffect(() => {
    if (isActive) {
      setOverlayStyle({...sharedOverlayStyle,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
      });
    } else {
      setOverlayStyle({...sharedOverlayStyle,
        pointerEvents: "none",
      });
    }
  }, [isActive]);

  return <div style={overlayStyle}>{children}</div>;
}

export default Overlay;
