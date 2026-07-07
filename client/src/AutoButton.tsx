import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

const BORDER_WIDTH_PX = 1.5;
const BORDER_RADIUS_PX = 19;

const wrapperStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
};

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

const guardRetryMessageStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  opacity: 0.75,
  maxWidth: 280,
  textAlign: "center",
  marginTop: 10,
};

export interface AutoButtonProps {
  /** Seconds before `action` runs automatically. */
  timeout: number;
  /** Called on click. On timeout, runs after guard passes (if any). */
  action: () => void;
  children: ReactNode;
  /**
   * When set, runs before `action` on timeout only.
   * Return `true` to run `action`; `false` restarts the countdown.
   */
  guardAction?: () => boolean | Promise<boolean>;
  /** Shown below the button after a failed guard until restart succeeds. */
  guardRetryMessage?: ReactNode;
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
  guardAction,
  guardRetryMessage,
  className,
  style,
  type = "button",
}: AutoButtonProps): ReactElement {
  const [done, setDone] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [checking, setChecking] = useState(false);
  const [guardFailed, setGuardFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (done) {
      return;
    }

    let alive = true;

    const id = window.setTimeout(() => {
      if (!guardAction) {
        if (alive) {
          setDone(true);
          action();
        }
        return;
      }

      setChecking(true);
      void Promise.resolve(guardAction()).then((ok: boolean) => {
        if (!alive) {
          return;
        }
        setChecking(false);
        if (ok) {
          setDone(true);
          action();
        } else {
          setGuardFailed(true);
          setCycle((c) => c + 1);
        }
      });
    }, timeout * 1000);

    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [action, cycle, done, guardAction, timeout]);

  const handleClick = () => {
    if (done || checking) {
      return;
    }
    setDone(true);
    action();
  };

  const baseButtonStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "transparent",
    color: "white",
    ...style,
  };

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

  const showRetryMessage = guardFailed && !done && guardRetryMessage != null;

  return (
    <div style={wrapperStyle}>
      <button
        type={type}
        className={className}
        style={{
          ...baseButtonStyle,
          ...(checking ? { opacity: 0.85, cursor: "default" } : undefined),
        }}
        disabled={checking}
        onClick={handleClick}
      >
        <span style={maskStyle} aria-hidden>
          <span key={cycle} style={barStyle} />
        </span>
        <span style={labelStyle}>{children}</span>
      </button>
      <p role="status" style={{ ...guardRetryMessageStyle, visibility: showRetryMessage ? "visible" : "hidden" }}>
        {guardRetryMessage}
      </p>
    </div>
  );
}
