import React, { useState } from "react";
import { useMobile } from "@/utils";
import { Icons, IconName } from "@icons";

/**
 * ConversationControlIcon Component
 *
 * A circular button used in the conversation controls (e.g., mute, next, end).
 * Handles hover states by swapping between outline and filled icon variants.
 *
 * @param {Object} props
 * @param {string} props.icon - Base icon name.
 * @param {string} [props.hoverIcon] - Hover icon name (optional).
 * @param {string} props.tooltip - Alt text for the icon.
 * @param {Function} props.onClick - Click handler.
 */
export type ConversationControlIconName = IconName;

interface ConversationControlIconProps {
  icon: ConversationControlIconName;
  hoverIcon?: ConversationControlIconName;
  tooltip?: string;
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

  const IconComponent = Icons[icon];

  // Determine hover component
  // Default strategy: look for "icon_filled" if hoverIcon is not provided
  let HoverComponent = Icons[icon + "_filled" as IconName];
  if (hoverIcon) {
    HoverComponent = Icons[hoverIcon];
  }
  // Fallback to the same icon if no filled version exists
  if (!HoverComponent) {
    HoverComponent = IconComponent;
  }

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
    // objectFit: "cover", // Not applicable to SVG components
    borderRadius: "50%",
  };

  const baseStyle = {
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
    <button
      style={buttonStyle}
      className={"control"}
      onClick={onClick}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      aria-label={tooltip}
    >
      <>
        <IconComponent style={baseStyle} aria-label={tooltip} />
        {HoverComponent && (
          <HoverComponent style={hoverStyle} aria-label={tooltip} />
        )}
      </>
    </button>
  );
}

export default React.memo(ConversationControlIcon);
