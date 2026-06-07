import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useMobile } from "@/utils";

export const MARQUEE_BANNER_TRANSITION_MS = 2000;

export type MarqueeRollingBannerProps = {
  visible: boolean;
  segmentCount: number;
  renderSegment: (index: number) => ReactNode;
  isPaused?: boolean;
  testId?: string;
  wrapContent?: (content: ReactNode) => ReactNode;
};

/** Wait two frames so the collapsed DOM is painted before opening. */
function scheduleBannerOpen(onOpen: () => void): () => void {
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(onOpen);
  });
  return () => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}

export default function MarqueeRollingBanner({
  visible,
  segmentCount,
  renderSegment,
  isPaused = false,
  testId,
  wrapContent,
}: MarqueeRollingBannerProps): ReactElement | null {
  const isMobile = useMobile();
  const [mounted, setMounted] = useState(() => visible);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setOpen(false);
      return scheduleBannerOpen(() => setOpen(true));
    }

    setOpen(false);
  }, [visible]);

  if (!mounted) {
    return null;
  }

  const bannerClassName = [
    "marquee-rolling-banner",
    open ? "marquee-rolling-banner--open" : "",
    open && !isMobile ? "marquee-rolling-banner--desktop-margins" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const trackClassName = [
    "marquee-rolling-banner__track",
    isPaused ? "marquee-rolling-banner__track--paused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const marquee = (
    <p className="marquee-rolling-banner__paragraph">
      <span
        className={trackClassName}
        style={{ "--marquee-segments": segmentCount } as CSSProperties}
      >
        {Array.from({ length: segmentCount }, (_, index) => (
          <span key={index} className="marquee-rolling-banner__segment">
            {renderSegment(index)}
          </span>
        ))}
      </span>
    </p>
  );

  return (
    <div className={bannerClassName} data-testid={testId}>
      <div className="marquee-rolling-banner__inner">
        {wrapContent ? wrapContent(marquee) : marquee}
      </div>
    </div>
  );
}
