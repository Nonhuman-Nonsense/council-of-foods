import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

const BORDER_WIDTH_PX = 1.5;
const BORDER_RADIUS_PX = 19;

const maskStyle: CSSProperties = {
  position: "absolute",
  top: BORDER_WIDTH_PX,
  right: BORDER_WIDTH_PX,
  bottom: BORDER_WIDTH_PX,
  left: BORDER_WIDTH_PX,
  borderRadius: BORDER_RADIUS_PX - BORDER_WIDTH_PX,
  overflow: "hidden",
  pointerEvents: "none",
};

const labelStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  mixBlendMode: "difference",
};

export interface AutoButtonProps {
  /** Seconds before `action` runs automatically. */
  timeout: number;
  /** Called on click and when the timeout elapses. */
  action: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
}

/**
 * Button that runs `action` on click or after `timeout` seconds.
 * Shows a fill that drains leftward in sync with the countdown.
 */
export default function AutoButton({
  timeout,
  action,
  children,
  className,
  style,
  type = "button",
}: AutoButtonProps): ReactElement {
  const actedRef = useRef(false);
  const timeoutIdRef = useRef<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const runAction = useCallback(() => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    action();
  }, [action]);

  useEffect(() => {
    timeoutIdRef.current = window.setTimeout(runAction, timeout * 1000);
    return () => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
      }
    };
  }, [timeout, runAction]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const barStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundColor: "white",
    transformOrigin: "left center",
    ...(reduceMotion
      ? { transform: "scaleX(0)" }
      : {
          animation: `auto-button-drain ${timeout}s linear forwards`,
        }),
  };

  return (
    <button
      type={type}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: "transparent",
        color: "white",
        ...style,
      }}
      onClick={runAction}
    >
      <span style={maskStyle} aria-hidden>
        <span style={barStyle} />
      </span>
      <span style={labelStyle}>{children}</span>
    </button>
  );
}
