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
      <h2>{t("autoplayWarning.title")}</h2>
      <p style={{ maxWidth: "420px", margin: "0 auto 20px", whiteSpace: "pre-line" }}>
        {t("autoplayWarning.body")}
      </p>
      <AutoButton
        timeout={AUTOPLAY_WARNING_TIMEOUT_SECONDS}
        action={onConfirm}
        style={{ marginTop: "4px" }}
      >
        {t("autoplayWarning.confirm")}
      </AutoButton>
    </div>
  );
}
