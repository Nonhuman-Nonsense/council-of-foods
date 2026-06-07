import type { Meeting } from "@shared/ModelTypes";
import { useTranslation } from "react-i18next";
import { Icons } from "@assets/icons";
import { useRouting } from "@/routing";
import { Link } from "react-router";
import MarqueeRollingBanner from "./MarqueeRollingBanner";

interface ReplayModeBannerProps {
  meeting: Meeting;
  isPaused: boolean;
  visible: boolean;
}

export default function ReplayModeBanner({
  meeting,
  isPaused,
  visible,
}: ReplayModeBannerProps) {
  const { t, i18n } = useTranslation();
  const { rootPath } = useRouting();

  const meetingDate = new Date(meeting.date).toLocaleDateString(i18n.language, {
    dateStyle: "long",
  });

  const preamble = t("replayModeBanner.preamble", {
    meetingId: meeting._id,
    meetingTitle: meeting.topic.title,
    meetingDate,
  });
  const clickText = t("replayModeBanner.click");
  const segmentCount = 3;

  return (
    <MarqueeRollingBanner
      visible={visible}
      isPaused={isPaused}
      segmentCount={segmentCount}
      wrapContent={(content) => (
        <Link to={rootPath} style={{ pointerEvents: "auto" }}>
          {content}
        </Link>
      )}
      renderSegment={() => (
        <>
          <Icons.tomato className="marquee-rolling-banner__tomato" />
          {preamble}
          {clickText}
        </>
      )}
    />
  );
}
