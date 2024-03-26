import React from "react";

function ContentSection({ isVisible, children }) {
  const sectionStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    visibility: isVisible ? "visible" : "hidden",
    opacity: isVisible ? 1 : 0,
    transition: "opacity 0.3s",
    transitionDelay: isVisible ? "0s" : "0.3s",
  };

  return <div style={sectionStyle}>{children}</div>;
}

export default ContentSection;
