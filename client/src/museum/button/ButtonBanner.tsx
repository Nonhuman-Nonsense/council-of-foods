import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/i18n";
import MarqueeRollingBanner from "@council/MarqueeRollingBanner";
import { Icons } from "@assets/icons";
import { useButtonStore } from "./buttonStore";
import { useRouting } from "@/navigation";

/** Short PTT copy needs many segments so the marquee fills the viewport. */
const BUTTON_BANNER_SEGMENT_COUNT = 14;
const REPLAY_BANNER_SEGMENT_COUNT = 3;

/** Fills the bottom bar's full-width banner row. */
const wrapperStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  overflow: "visible",
  pointerEvents: "none",
  flexShrink: 0,
};

/**
 * Bottom marquee banner. Visibility and content are driven by `useButtonBanner`
 * consumers via `buttonStore`. Goes in a BottomBar's `banner` row — the setup
 * agent's on the setup screens, the meeting footer's in a meeting.
 */
export default function ButtonBanner(): ReactElement | null {
  const activeButtonBanner = useButtonStore((state) => state.activeButtonBanner);
  const buttonOwner = useButtonStore((state) => state.buttonOwner);
  const bannerMessageKey = useButtonStore((state) =>
    buttonOwner ? state.bannerMessageKeys[buttonOwner] : undefined,
  );
  const bannerContent = useButtonStore((state) =>
    buttonOwner ? state.bannerContent[buttonOwner] : undefined,
  );
  const { t } = useTranslation();
  const { rootPath } = useRouting();

  if (!activeButtonBanner) {
    return null;
  }

  if (bannerContent?.kind === "replay") {
    const isAutoplayOwner = buttonOwner === "autoplay";
    const preamble = t("replay.preamble", {
      meetingId: bannerContent.meetingId,
      meetingTitle: bannerContent.meetingTitle,
      meetingDate: bannerContent.meetingDate,
    });
    const callToAction = isAutoplayOwner ? t("replay.pressButton") : t("replay.click");

    const content = (
      <>
        <Icons.tomato className="marquee-rolling-banner__tomato" />
        {preamble}
        {callToAction}
      </>
    );

    return (
      <div style={wrapperStyle}>
        <MarqueeRollingBanner
          visible={activeButtonBanner}
          isPaused={bannerContent.isPaused}
          segmentCount={REPLAY_BANNER_SEGMENT_COUNT}
          testId="button-banner"
          wrapContent={(segment) => (
            <Link to={rootPath} style={{ pointerEvents: "auto" }}>
              {segment}
            </Link>
          )}
          renderSegment={() => content}
        />
      </div>
    );
  }

  const messageKey: TranslationKey = bannerMessageKey ?? "ptt.holdToSpeak";
  const message = t(messageKey);

  return (
    <div style={wrapperStyle}>
      <MarqueeRollingBanner
        visible={activeButtonBanner}
        segmentCount={BUTTON_BANNER_SEGMENT_COUNT}
        testId="button-banner"
        renderSegment={(index) => (
          <>
            <Icons.tomato className="marquee-rolling-banner__tomato" aria-hidden={index !== 0} />
            <span aria-hidden={index !== 0}>{message}</span>
            <Icons.tomato className="marquee-rolling-banner__tomato" aria-hidden />
            <span aria-hidden={index !== 0}>{message}</span>
          </>
        )}
      />
    </div>
  );
}
