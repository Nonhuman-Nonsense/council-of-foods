import React, { useState } from "react";
import { useMobile } from "../utils";

/**
 * ConversationControlIcon Component
 * 
 * A circular button used in the conversation controls (e.g., mute, next, end).
 * Handles hover states by swapping between outline and filled icon variants.
 * 
 * @param {Object} props
 * @param {string} props.icon - Base icon filename (without extension).
 * @param {string} [props.hoverIcon] - Hover icon filename (optional fallback to filled).
 * @param {string} props.tooltip - Alt text for the icon.
 * @param {Function} props.onClick - Click handler.
 */
interface ConversationControlIconProps {
  icon: string;
  hoverIcon?: string;
  tooltip: string;
  onClick: () => void;
}

function ConversationControlIcon({
  icon,
  hoverIcon,
  tooltip,
  onClick
}: ConversationControlIconProps) {
  let [isHover, setHover] = useState(false);
  const isMobile = useMobile();

  const imageUrl = `/icons/${icon}.svg`;
  let hoverUrl = `/icons/${icon}_filled.svg`;
  if (hoverIcon) hoverUrl = `/icons/${hoverIcon}.svg`;

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  const buttonStyle: React.CSSProperties = {
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

  const sharedStyle: React.CSSProperties = {
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

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

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
