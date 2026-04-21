import type { Meeting } from "@shared/ModelTypes";
import { useEffect, useRef, useState } from "react";
import { useMobile } from "@/utils";
import { useTranslation } from "react-i18next";
import { Icons } from "@icons";
import { useRouting } from "@/routing";
import { Link } from "react-router";

const BANNER_TRANSITION_MS = 2000;
const ANIMATION = BANNER_TRANSITION_MS + 'ms cubic-bezier(0.22, 1, 0.36, 1)';

interface ReplayModeBannerProps {
  meeting: Meeting;
  isPaused: boolean;
  visible: boolean;
}

export default function ReplayModeBanner({
  meeting,
  isPaused,
  visible
}: ReplayModeBannerProps) {
  const isMobile = useMobile();
  const { t, i18n } = useTranslation();
  const { rootPath } = useRouting();
  const sawReplayRef = useRef(false);
  const [fullyHidden, setFullyHidden] = useState(() => !visible);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      sawReplayRef.current = true;
      setFullyHidden(false);
      setOpen(false);
      const enter = window.setTimeout(() => setOpen(true), 0);
      return () => clearTimeout(enter);
    }

    setOpen(false);
    if (!sawReplayRef.current) {
      setFullyHidden(true);
      return;
    }

    const exit = window.setTimeout(() => setFullyHidden(true), BANNER_TRANSITION_MS);
    return () => clearTimeout(exit);
  }, [visible]);

  const meetingDate = new Date(meeting.date).toLocaleDateString(i18n.language, {
    dateStyle: "long",
  });

  const bannerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    width: "100%",
    transition: `grid-template-rows ${ANIMATION}, margin ${ANIMATION}`,
    overflow: "clip",
    marginTop: isMobile || !open ? "0" : "10px",
    marginBottom: isMobile || !open ? "0" : "5px",
    zIndex: 2,
  };

  const innerStyle: React.CSSProperties = {
    overflow: "hidden",
    minHeight: 0,
    transition: `transform ${ANIMATION}, opacity ${ANIMATION}`,
    transform: open ? "translate3d(0, 0, 0)" : "translate3d(0, 120%, 0)",
    opacity: open ? 1 : 0,
  }

  const paragraphStyle: React.CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "15px" : "20px",
    margin: 0,
    color: "rgba(255, 255, 255, 0.6)",
    display: "inline-block",
    whiteSpace: "nowrap",
  };

  const tomatoStyle: React.CSSProperties = {
    width: "13px",
    height: "13px",
    display: "inline-block",
    opacity: 0.6,
    marginRight: "10px",
    marginLeft: "10px",
  };

  const marqueeTrackStyle: React.CSSProperties = {
    display: "inline-block",
    whiteSpace: "nowrap",
    animation: "marquee-animation 40s linear infinite",
    willChange: "transform",
    backfaceVisibility: "hidden",
    animationPlayState: isPaused ? "paused" : "running"
  }

  const marqueeSegmentStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  }

  const preamble = t('replayModeBanner.preamble', { meetingId: meeting._id, meetingTitle: meeting.topic.title, meetingDate });

  const segmentCount = 3;

  function renderSegment(key?: number) {
    return (
      <span key={key} style={marqueeSegmentStyle} aria-hidden="true">
        <Icons.tomato style={tomatoStyle} />
        {preamble}
        {t('replayModeBanner.click')}
      </span>
    );
  }

  if (fullyHidden) {
    return null;
  }

  return (
    <div style={bannerStyle}>
      <div style={innerStyle}>
        <Link to={rootPath} style={{ pointerEvents: "auto" }}>
          <p style={paragraphStyle}>
            <span style={{ ...marqueeTrackStyle, "--marquee-segments": segmentCount } as React.CSSProperties}>
              {Array.from({ length: segmentCount }, (_, i) => renderSegment(i))}
            </span>
          </p>
        </Link>
      </div>
    </div>
  );
}
