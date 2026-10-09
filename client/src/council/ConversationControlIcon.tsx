import React, { useRef, useState } from "react";
import { useMobile } from "@/utils";
import { Icons, IconName } from "@assets/icons";

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
  onClick?: () => void;
  /**
   * A hold button instead of a click: `onPress` when it goes down, `onRelease` when it is
   * let go — wherever the pointer is by then, or if the browser takes the pointer away.
   */
  hold?: { onPress: () => void; onRelease: () => void };
  size?: number;
}

function ConversationControlIcon({
  icon,
  hoverIcon,
  tooltip,
  onClick,
  hold,
  size
}: ConversationControlIconProps) {
  const [isHover, setHover] = useState(false);
  const holdingRef = useRef(false);
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
    width: size ? `${size}px` : isMobile ? "45px" : "56px",
    height: size ? `${size}px` : isMobile ? "45px" : "56px",
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
    width: size ? `${size - 5}px` : isMobile ? "30px" : "40px",
    height: size ? `${size - 5}px` : isMobile ? "30px" : "40px",
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

  const endHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    hold?.onRelease();
  };

  const holdHandlers: React.ButtonHTMLAttributes<HTMLButtonElement> = hold
    ? {
        onPointerDown: (event) => {
          // The primary button only: no right-click or middle-click holds.
          if (event.button > 0) return;
          // No focus, text selection or touch gestures: a hold is all this button does.
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          holdingRef.current = true;
          hold.onPress();
        },
        onPointerUp: endHold,
        onPointerCancel: endHold,
        onLostPointerCapture: endHold,
        // A long press on a touch screen would otherwise open the context menu.
        onContextMenu: (event) => event.preventDefault(),
      }
    : { onClick };

  return (
    <button
      style={hold ? { ...buttonStyle, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } : buttonStyle}
      className={"control"}
      {...holdHandlers}
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
