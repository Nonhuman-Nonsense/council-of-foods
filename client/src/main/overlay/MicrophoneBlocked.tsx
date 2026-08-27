import { useTranslation } from "react-i18next";
import { useMicAvailabilityStore } from "@realtime/micAvailabilityStore";

/**
 * Shown when the visitor asks to talk but the microphone can't be had.
 *
 * Only ever raised by an explicit request (the mic button) — a visitor who
 * simply declined the prompt is left alone, since the whole flow works by
 * clicking. On most browsers a blocked mic can't be re-prompted from script at
 * all, so this explains where the switch actually lives rather than offering a
 * retry that would silently do nothing.
 */
function MicrophoneBlocked({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  const { t } = useTranslation();
  const reason = useMicAvailabilityStore((s) => s.reason);

  const body =
    reason === "not_found"
      ? t("microphone.noDevice")
      : reason === "in_use"
        ? t("microphone.inUse")
        : reason === "insecure_context" || reason === "unsupported"
          ? t("microphone.unsupported")
          : t("microphone.blocked");

  return (
    <div>
      <h2>{t("microphone.title")}</h2>
      <h4 style={{ maxWidth: "min(600px,80vw)", whiteSpace: "pre-wrap" }}>{body}</h4>
      <div>
        <button onClick={onDismiss}>{t("microphone.dismiss")}</button>
      </div>
    </div>
  );
}

export default MicrophoneBlocked;
