import React, { useState, CSSProperties } from "react";
import { useMobile } from "../utils";

interface ConversationControlIconProps {
    icon: string;
    hoverIcon?: string;
    tooltip: string;
    onClick: () => void;
}

/**
 * ConversationControlIcon Component
 * 
 * A circular button used in the conversation controls (e.g., mute, next, end).
 * Handles hover states by swapping between outline and filled icon variants.
 */
function ConversationControlIcon({
    icon,
    hoverIcon,
    tooltip,
    onClick
}: ConversationControlIconProps): JSX.Element {
    const [isHover, setHover] = useState<boolean>(false);
    const isMobile: boolean = useMobile();

    const imageUrl = `/icons/${icon}.svg`;
    let hoverUrl = `/icons/${icon}_filled.svg`;
    if (hoverIcon) hoverUrl = `/icons/${hoverIcon}.svg`;

    /* -------------------------------------------------------------------------- */
    /*                                    Styles                                  */
    /* -------------------------------------------------------------------------- */

    const buttonStyle: CSSProperties = {
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

    const sharedStyle: CSSProperties = {
        position: "absolute",
        // left: "0",
        width: isMobile ? "30px" : "40px",
        height: isMobile ? "30px" : "40px",
        objectFit: "cover",
        borderRadius: "50%",
    };

    const imageStyle: CSSProperties = {
        ...sharedStyle,
        opacity: (isHover ? "0" : "1")
    }

    const hoverStyle: CSSProperties = {
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
