import RotateDevice from "@main/overlay/RotateDevice";
import { useMediaQuery } from 'react-responsive'
import { Link } from "react-router";
import { useMobile, dvh } from "@/utils";
import { useTranslation } from 'react-i18next';
import { useRouting } from "@/routing";
import { useAppMode } from "@/museum/useAppMode";
import nonhumanLogo from "@assets/logos/nonhuman_nonsense_logo.png";
import biosphereLogo from "@assets/logos/logo_biosphere.svg?url";

/**
 * Landing Component
 * 
 * The initial entry screen.
 * 
 * Core Logic:
 * - **Device Orientation**: Forces landscape on mobile/tablet via `RotateDevice`.
 * - **Welcome Message**: Displays logo and welcome text.
 * - **Museum mode**: Hides description and go button (voice guide handles the flow).
 */
const Landing: React.FC = () => {
  const { newMeetingPath } = useRouting();
  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })
  const isMobile = useMobile();
  const { isMuseumMode } = useAppMode();
  const { t } = useTranslation();

  const wrapper: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const welcomeStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "80%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "5%"
  };

  const logosRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const logoStyle: React.CSSProperties = {
    opacity: 0.9,
  };

  const nonhumanLogoStyle: React.CSSProperties = {
    ...logoStyle,
    maxWidth: isMobile ? "80px" : "120px",
    height: isMobile ? "10" + dvh : "61px",
    minHeight: "30px",
    marginRight: "20px",
  };

  const biosphereLogoStyle: React.CSSProperties = {
    ...logoStyle,
    maxWidth: isMobile ? "80px" : "150px",
    height: isMobile ? "10" + dvh : "100px",
    minHeight: "30px",
  };

  return (
    <div style={wrapper}>
      <div style={welcomeStyle}>

        <div>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ marginBottom: "-10px", marginTop: isMobile ? "0" : "" }}>{t('landing.welcome')}</h2>
            <h1 style={{ margin: isMobile ? "5px 0 0 0" : "" }}>{t('council').toUpperCase()}</h1>
            <p>{t('landing.projectBy')}</p>
          </div>

          <div style={logosRowStyle}>
            <Link to={{ hash: "contact" }}>
              <img alt="Nonhuman Nonsense" src={nonhumanLogo} style={nonhumanLogoStyle} />
            </Link>
            <Link to={{ hash: "contact" }}>
              <img src={biosphereLogo} alt={t('biosphere')} style={biosphereLogoStyle} />
            </Link>
          </div>
        </div>

        {isPortrait ?
          <RotateDevice />
          :
          !isMuseumMode && (
            <div style={{ maxWidth: "380px" }}>
              <p style={{ marginBottom: "30px" }}>{t('landing.description')}</p>
              <div>
                <Link to={newMeetingPath} className="button" data-testid="landing-go">
                  {t('landing.go')}
                </Link>
              </div>
            </div>
          )
        }
      </div>
    </div>
  );
}

export default Landing;
