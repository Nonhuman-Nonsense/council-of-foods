import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMobile, dvh } from "@/utils";
import { useRouting } from "@/navigation";
import { useCouncilSettings } from "@/settings/councilSettings";
import { notifyAutoplay } from "@/autoplay/autoplayStore";
import { useSummaryExit } from "./useSummaryExit";
import { CREDIT_GROUPS, CREDIT_LOGOS } from "./creditsContent";
import type { CreditText } from "./creditsTypes";

/** How long "Thank You" stands alone before the credits start to roll. */
export const CREDITS_HOLD_MS = 5_000;
/** How long the credits take to roll, from "Thank You" leaving to the logos. */
export const CREDITS_SCROLL_MS = 50_000;
/** The share of the roll spent speeding up at the start, and slowing down at the end. */
const CREDITS_EASE = 0.1;

/**
 * Where the roll is (0–1) at a point in its time (0–1): it eases in and out over the first and
 * last {@link CREDITS_EASE} of it and runs steadily in between, so the middle reads at nearly
 * the linear speed — unlike the summary's curve, which is fastest there.
 */
export function creditsRollPosition(time: number): number {
  const t = Math.min(1, Math.max(0, time));
  const top = 1 / (1 - CREDITS_EASE);
  if (t < CREDITS_EASE) return (top * t * t) / (2 * CREDITS_EASE);
  if (t > 1 - CREDITS_EASE) return 1 - (top * (1 - t) * (1 - t)) / (2 * CREDITS_EASE);
  return top * (t - CREDITS_EASE / 2);
}

/**
 * The end of a meeting at an installation that prints its letters (docs/council-letters.md):
 * after the chair's farewell, every meeting ends the same way — "Thank You", then the credits
 * rolling like a film's, on a fixed clock — while the letter comes out of the printer. Nothing is
 * read aloud. The talk button, or a click anywhere, starts a new meeting; once the credits have
 * rolled, the app returns to the landing page by itself, as after a summary.
 */
function Credits(): React.ReactElement {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const navigate = useNavigate();
  const { rootPath } = useRouting();
  const { capabilities } = useCouncilSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const installation = capabilities.teleprompter;

  useSummaryExit(installation);

  useEffect(() => {
    if (!installation) return;
    const restart = () => navigate(rootPath);
    window.addEventListener("pointerdown", restart);
    return () => window.removeEventListener("pointerdown", restart);
  }, [installation, navigate, rootPath]);

  // A roll from the top to the end on its own clock: there is no reading to follow.
  useEffect(() => {
    let frame: number | null = null;
    let finished = false;
    const startedAt = performance.now() + CREDITS_HOLD_MS;
    const roll = (now: number) => {
      const element = scrollRef.current;
      if (!element) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / CREDITS_SCROLL_MS));
      element.scrollTop = creditsRollPosition(progress) * (element.scrollHeight - element.clientHeight);
      if (progress >= 1 && !finished) {
        finished = true;
        notifyAutoplay({ type: "summary-playback-finished" });
        return;
      }
      frame = requestAnimationFrame(roll);
    };
    frame = requestAnimationFrame(roll);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const text = (credit: CreditText) => ("key" in credit ? t(credit.key) : credit.name);

  const wrapper: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    height: `100${dvh}`,
    width: isMobile ? "600px" : "800px",
    maxWidth: "100vw",
    overflowY: "hidden",
    mask: "linear-gradient(to bottom, rgba(0,0,0,0) 0, rgb(0,0,0) 10%, rgb(0,0,0) 90%, rgba(0,0,0,0) 100%)",
  };
  const screen: React.CSSProperties = {
    height: `100${dvh}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const columns: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: "1.5em",
    rowGap: "0.35em",
    margin: "0 0 3em",
  };

  return (
    <div ref={scrollRef} style={wrapper} className="scroll scroll--hide-scrollbar" data-testid="credits">
      {/* "Thank You" centred on the screen, with only the gap below it before the credits. */}
      <div style={{ height: `50${dvh}`, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <h1 style={{ fontSize: isMobile ? "40px" : "64px", margin: 0, lineHeight: 1, transform: "translateY(50%)" }}>
          {t("credits.thankYou")}
        </h1>
      </div>
      <div style={{ height: `15${dvh}` }} />
      <p style={{ fontSize: isMobile ? "18px" : "22px", lineHeight: 1.5, margin: "0 0 3em", padding: "0 20px" }}>
        {t("credits.intro")}
      </p>
      {CREDIT_GROUPS.map((group) => (
        <section key={group.headingKey ?? "team"}>
          {group.headingKey && <h3 style={{ margin: "0 0 1.2em" }}>{t(group.headingKey)}</h3>}
          <div style={columns}>
            {group.credits.map((credit) => (
              <React.Fragment key={credit.names[0]}>
                <div style={{ textAlign: "right", opacity: 0.7 }}>{text(credit.role)}</div>
                <div style={{ textAlign: "left" }}>
                  {credit.names.map((name) => <div key={name}>{name}</div>)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </section>
      ))}
      <p style={{ margin: "0 0 2em" }}>{t("credits.funding")}</p>
      <div style={{ ...screen, flexDirection: "column", gap: "2em" }}>
        {CREDIT_LOGOS.map((row) => (
          <div key={row[0].src} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2em", width: "100%" }}>
            {row.map((item) => (
              <img key={item.src} alt={text(item.alt)} src={item.src} style={{ maxWidth: `${item.maxWidth}px`, height: `${item.height}px`, objectFit: "contain" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Credits;
