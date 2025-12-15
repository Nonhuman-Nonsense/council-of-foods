import React, { useState } from "react";
import { useMobile } from "../utils";

function ConversationControlIcon({
  icon,
  hoverIcon,
  tooltip,
  onClick
}) {
  let [isHover, setHover] = useState(false);
  const isMobile = useMobile();

  const imageUrl = `/icons/${icon}.svg`;
  let hoverUrl = `/icons/${icon}_filled.svg`;
  if (hoverIcon) hoverUrl = `/icons/${hoverIcon}.svg`;

  const buttonStyle = {
    marginLeft: "4px",
    marginRight: "4px",
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    border: "0",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  };

  const sharedStyle = {
    position: "absolute",
    // left: "0",
    width: isMobile ? "30px" : "40px",
    height: isMobile ? "30px" : "40px",
    objectFit: "cover",
    borderRadius: "50%",
  };

  const imageStyle = {
    ...sharedStyle,
    opacity: (isHover ? "0" : "1")
  }

  const hoverStyle = {
    ...sharedStyle,
    opacity: (isHover ? "1" : "0")
  };

  return (
    <button style={buttonStyle} className={"control"} onClick={onClick} onMouseOver={() => setHover(true)} onMouseOut={() => setHover(false)}>
      <>
        <img
          src={imageUrl}
          alt={tooltip}
          style={imageStyle}
        />
        <img
          src={hoverUrl}
          alt={tooltip}
          style={hoverStyle}
        />
      </>
    </button>
  );
}

export default React.memo(ConversationControlIcon);
