import { Trans, useTranslation } from "react-i18next";
import { useMobile, dvh } from "@/utils";
import { externalLinks } from "@/i18n/externalLinks";
import nonhumanLogo from "@assets/logos/nonhuman_nonsense_logo.png";
import euLogo from "@assets/logos/logos_eu-white-starts-white.webp";

/**
 * Contact Overlay
 *
 * Displays credits, logos, and contact information.
 * Lists the team, partners, and funding sources (EU S+T+ARTS).
 */
function Contact(): React.ReactElement {
  const isMobile = useMobile();
  const { t } = useTranslation();

  const wrapper: React.CSSProperties = {
    width: "80vw",
    maxWidth: isMobile ? "550px" : "450px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  return (
    <div style={wrapper}>
      <a href="https://nonhuman-nonsense.com">
        <img
          alt="Nonhuman Nonsense"
          src={nonhumanLogo}
          style={{
            maxWidth: isMobile ? "80px" : "120px",
            height: isMobile ? "10" + dvh : "61px",
            minHeight: "30px",
          }}
        />
      </a>
      <p>
        <Trans i18nKey="contact.credits" components={externalLinks} />
      </p>
      <p>
        <a href="https://www.instagram.com/nonhuman_nonsense/">@nonhuman_nonsense</a>
        <br />
        <a href="https://nonhuman-nonsense.com">nonhuman-nonsense.com</a>
        <br />
        <a href="mailto:hello@nonhuman-nonsense.com">hello@nonhuman-nonsense.com</a>
      </p>
      <p>
        <Trans i18nKey="contact.funding" components={externalLinks} />
      </p>
      <img
        alt={t("contact.euImageAlt")}
        src={euLogo}
        style={{
          width: "95vw",
          maxWidth: isMobile ? "300px" : "450px",
          height: isMobile ? "15vh" : "84px",
          minHeight: "45px",
        }}
      />
    </div>
  );
}

export default Contact;
