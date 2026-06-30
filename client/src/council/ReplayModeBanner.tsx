import type { Meeting } from "@shared/ModelTypes";
import { useTranslation } from "react-i18next";
import { Icons } from "@assets/icons";
import { useRouting } from "@/routing";
import { Link } from "react-router";
import MarqueeRollingBanner from "./MarqueeRollingBanner";
import { useAutoplay } from "@/autoplay/autoplayStore";

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
  const { replayBannerVariant } = useAutoplay();

  const meetingDate = new Date(meeting.date).toLocaleDateString(i18n.language, {
    dateStyle: "long",
  });

  const preamble = t("replay.preamble", {
    meetingId: meeting._id,
    meetingTitle: meeting.topic.title,
    meetingDate,
  });
  const callToAction =
    replayBannerVariant === "autoplay"
      ? t("replay.pressButton")
      : t("replay.click");
  const segmentCount = 3;

  const content = (
    <>
      <Icons.tomato className="marquee-rolling-banner__tomato" />
      {preamble}
      {callToAction}
    </>
  );

  return (
    <MarqueeRollingBanner
      visible={visible}
      isPaused={isPaused}
      segmentCount={segmentCount}
      wrapContent={
        replayBannerVariant === "autoplay"
          ? (segment) => <span>{segment}</span>
          : (segment) => (
              <Link to={rootPath} style={{ pointerEvents: "auto" }}>
                {segment}
              </Link>
            )
      }
      renderSegment={() => content}
    />
  );
}
