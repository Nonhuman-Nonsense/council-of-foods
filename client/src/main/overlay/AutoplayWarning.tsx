import { useTranslation } from "react-i18next";
import AutoButton from "@/AutoButton";

export const AUTOPLAY_WARNING_TIMEOUT_SECONDS = 20;

interface AutoplayWarningProps {
  onConfirm: () => void;
}

export default function AutoplayWarning({ onConfirm }: AutoplayWarningProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div>
      <h2>{t("autoplay.stillThere.title")}</h2>
      <p style={{ maxWidth: "420px", margin: "0 auto 20px", whiteSpace: "pre-line" }}>
        {t("autoplay.stillThere.body")}
      </p>
      <AutoButton
        timeout={AUTOPLAY_WARNING_TIMEOUT_SECONDS}
        action={onConfirm}
        style={{ marginTop: "4px" }}
      >
        {t("autoplay.stillThere.confirm")}
      </AutoButton>
    </div>
  );
}
