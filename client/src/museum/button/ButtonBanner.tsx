import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import MarqueeRollingBanner from "@council/MarqueeRollingBanner";
import { Icons } from "@assets/icons";
import { useButtonStore } from "./buttonStore";
import { useCouncilSettings } from "@/settings/councilSettings";

/** Short PTT copy needs many segments so the marquee fills the viewport. */
const BUTTON_BANNER_SEGMENT_COUNT = 14;

/**
 * Global PTT idle hint banner. Visibility is driven by `useButtonBanner` consumers
 * via `buttonStore.setButtonBannerVisible`.
 */
export default function ButtonBanner(): ReactElement | null {
  const { agentMode } = useCouncilSettings();
  const activeButtonBanner = useButtonStore((state) => state.activeButtonBanner);
  const buttonOwner = useButtonStore((state) => state.buttonOwner);
  const bannerMessageKey = useButtonStore((state) =>
    buttonOwner ? state.bannerMessageKeys[buttonOwner] : undefined,
  );
  const { t } = useTranslation();

  if (agentMode !== "ptt") {
    return null;
  }

  const message = t(bannerMessageKey ?? "ptt.holdToSpeak");

  return (
    <div className="bottom-ui-banner-anchor">
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
