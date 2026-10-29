import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMobile, usePortrait } from "@/utils";
import type { ReplayIntroFacts, ReplayIntroKind } from "@council/replayIntro";

interface ReplayIntroProps {
  kind: ReplayIntroKind;
  facts: ReplayIntroFacts;
  onWatch: () => void;
}

/**
 * ReplayIntro Overlay
 *
 * What someone landing straight on a replay sees first: what the council is (the landing page's
 * line), which meeting this is and what it was about, who took part, and — when they came from the link in a letter
 * (`#email`) — that the letter they received was written in it. Laid out like About.
 */
function ReplayIntro({ kind, facts, onWatch }: ReplayIntroProps): React.ReactElement {
  const isMobile = useMobile();
  const isPortait = usePortrait();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onWatch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onWatch]);

  const wrapper: React.CSSProperties = {
    width: isPortait ? "80vw" : undefined,
    maxWidth: isMobile ? "600px" : "550px",
  };

  const paragraph: React.CSSProperties = { marginTop: "20px", marginBottom: "20px" };

  const values = {
    topic: facts.topic ?? t("replay.intro.customTopic"),
    date: new Date(facts.date).toLocaleDateString(i18n.language, { dateStyle: "long" }),
    venue: facts.venueName ?? "",
    author: facts.letterAuthor ?? t("replay.intro.someBeing"),
  };
  const opening = kind === "email"
    ? (facts.venueName ? t("replay.intro.emailAtVenue", values) : t("replay.intro.email", values))
    : (facts.venueName ? t("replay.intro.replayAtVenue", values) : t("replay.intro.replay", values));

  const participants = facts.participants
    .map((p) => (p.human ? t("replay.intro.human", { name: p.name }) : p.name))
    .join(", ") + ".";

  // A label on its own line, then what it labels.
  const section = (label: string, text: string): React.ReactElement => (
    <p style={paragraph}>
      {label}
      <br />
      {text}
    </p>
  );

  return (
    <div style={wrapper}>
      <h2>{t("app.council").toUpperCase()}</h2>
      <h3 style={{ marginBottom: "30px" }}>{t("replay.intro.meeting", { meetingId: facts.meetingId })}</h3>
      {/* Paragraphs a little further apart than the default 13px, and the landing page's 30px
          before the button. */}
      <div style={{ textAlign: "left", marginBottom: "30px" }}>
        <p style={{ ...paragraph, whiteSpace: "pre-line" }}>{t("landing.description")}</p>
        <p style={paragraph}>{opening}</p>
        {facts.topicDescription && section(t("replay.intro.topicLabel"), facts.topicDescription)}
        {facts.agendaPoint && section(t("replay.intro.agendaLabel"), facts.agendaPoint)}
        {section(t("replay.intro.participantsLabel"), participants)}
        {kind === "email" && <p style={paragraph}>{t("replay.intro.emailWatch")} {t("replay.intro.emailReply")}</p>}
      </div>
      <button onClick={onWatch}>{t("landing.go")}</button>
      <div style={{ height: "60px" }} />
    </div>
  );
}

export default ReplayIntro;
