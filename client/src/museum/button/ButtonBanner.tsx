import type { ReactElement } from "react";
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

interface ButtonBannerProps {
  /** When true, flows inside the council footer flex instead of fixed viewport bottom. */
  inline?: boolean;
}

/**
 * Bottom marquee banner. Visibility and content are driven by `useButtonBanner`
 * consumers via `buttonStore`.
 */
export default function ButtonBanner({ inline = false }: ButtonBannerProps): ReactElement | null {
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

  const wrapperClass = inline ? "council-shell__banner" : "bottom-ui-banner-anchor";

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
      <div className={wrapperClass}>
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
    <div className={wrapperClass}>
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
