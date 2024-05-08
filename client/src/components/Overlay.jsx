import React, { useState, useEffect } from "react";

function Overlay({ isActive, isBlurred, children }) {
  const [overlayStyle, setOverlayStyle] = useState({});

  const sharedOverlayStyle ={
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  useEffect(() => {
    if (isActive) {
      setOverlayStyle({...sharedOverlayStyle,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: (isBlurred === false ? "" : "blur(10px)"),
        WebkitBackdropFilter: (isBlurred === false ? "" : "blur(10px)"),
        pointerEvents: "auto",
      });
    } else {
      setOverlayStyle({...sharedOverlayStyle,
        pointerEvents: "none",
      });
    }
  }, [isActive, isBlurred]);

  return <div style={overlayStyle}>{children}</div>;
}

export default Overlay;
