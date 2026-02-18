import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, NavigateFunction, Location, Link } from "react-router";
import { useMediaQuery } from 'react-responsive'
import { useTranslation } from 'react-i18next';
import { capitalizeFirstLetter, useMobile, useMobileXs, usePortrait } from "@/utils";
import Lottie from "react-lottie-player";
import hamburger from "@animations/hamburger.json";
import councilLogo from "@assets/logos/council_logo_white.svg";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import routes from "@/routes.json";

interface NavbarProps {
  lang: string;
  topic: string;
  hamburgerOpen: boolean;
  setHamburgerOpen: (open: boolean) => void;
}

interface LottiePlayerHandle {
  play: () => void;
  setDirection: (direction: number) => void;
  stop: () => void;
}

/**
 * Navbar Component
 * 
 * The main application navigation bar.
 * Handles desktop/mobile rendering, hamburger menu toggling, and routing.
 * 
 * Core Logic:
 * - Detects active section based on URL hash (e.g. `#contact`).
 * - Manages hamburger menu animation state for mobile devices.
 * - Displays the "Council" logo and current topic when allowed (`showIconinMeny`).
 */
function Navbar({ lang, topic, hamburgerOpen, setHamburgerOpen }: NavbarProps): React.ReactElement {
  const isMobile: boolean = useMobile();
  const isMobileXs: boolean = useMobileXs();
  const isPortrait: boolean = usePortrait();
  const showIconinMeny: boolean = useMediaQuery({ query: '(min-width: 700px)' });
  const hamburgerAnimation = useRef<any>(null);
  const [activeMenuItem, setActiveMenuItem] = useState<string>('');
  const location: Location = useLocation();
  const navigate: NavigateFunction = useNavigate();

  const { t } = useTranslation();

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (['#about', '#contact', '#settings'].includes(location.hash)) {
      setActiveMenuItem(location.hash);
    } else {
      setActiveMenuItem('');
    }
  }, [location]);

  useEffect(() => {
    if (!hamburgerOpen) {
      hamburgerAnimation.current?.setDirection(-1);
      hamburgerAnimation.current?.play();
    } else {
      hamburgerAnimation.current?.setDirection(1);
      hamburgerAnimation.current?.play();
    }
  }, [hamburgerOpen]);

  /* -------------------------------------------------------------------------- */
  /*                                  Handlers                                  */
  /* -------------------------------------------------------------------------- */

  function handleOnNavigate(to: string): void {
    navigate({
      hash: to
    });

    if (isMobile) {
      //If something is clicked in the menu on mobile, close the hamburger to give more space for content
      setHamburgerOpen(false);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  const navbarStyle: React.CSSProperties = {
    padding: isMobile ? (isMobileXs ? "15px 15px 0 15px" : "20px 20px 0 20px") : "20px",
    display: isPortrait ? "none" : "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    color: "white",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
    zIndex: 10,
    height: isMobile && isMobileXs ? "45px" : "60px",
    pointerEvents: "none"
  };

  const hamburgerStyle: React.CSSProperties = {
    cursor: "pointer",
    width: isMobileXs ? "40px" : "50px",
    height: isMobileXs ? "40px" : "50px",
    margin: "-12px",
    marginLeft: "5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    pointerEvents: "auto",
  };

  const languageStyle: React.CSSProperties = {
    cursor: "pointer",
    opacity: "1",
    transitionProperty: "opacity",
    transitionDuration: "1s",
    transitionDelay: "0.2s",
    pointerEvents: "auto",
    textUnderlineOffset: "4px",
  };

  const navItems: string[] = ["settings", "about", "contact"];

  const showMenu: boolean = (!isMobile || hamburgerOpen);

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <nav
      style={navbarStyle}
      role="navigation"
      className={isMobile ? (hamburgerOpen ? "blur" : "blur hide") : ""}
    >
      <div
        style={{
          textAlign: "left",
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          opacity: (!isMobile || hamburgerOpen) ? "1" : "0",
          transitionProperty: "opacity",
          transitionDuration: "1s",
          transitionDelay: "0.2s",
          pointerEvents: (!isMobile || hamburgerOpen) ? "auto" : "none"
        }}
      >
        {location.pathname !== "/" && <>
          <img style={{ width: isMobile ? (isMobileXs ? '65px' : '70px') : '75px', marginRight: "10px", marginTop: isMobile ? (isMobileXs ? '0' : "3px") : "5px", cursor: "pointer", visibility: showIconinMeny ? "visible" : "hidden" }} onClick={() => handleOnNavigate("reset")} src={councilLogo} alt="Council of Foods logo" />
          <div>
            <h3
              style={{
                margin: "0",
                padding: "0",
                cursor: "pointer",
                visibility: showIconinMeny ? "visible" : "hidden",
              }}
              onClick={() => handleOnNavigate("reset")}
            >{t('council').toUpperCase()}</h3>
            <h4 style={{ marginTop: "5px", visibility: showIconinMeny ? "visible" : "hidden" }}>{capitalizeFirstLetter(topic)}</h4>
          </div>
        </>}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "end" }}
      >
        <div style={{ display: "flex" }}>
          {navItems.map((item) => (
            <NavItem
              key={item}
              name={item}
              show={showMenu && (item !== 'settings' || location.pathname.includes(routes.meeting))}
              isActive={activeMenuItem === `#${item}`} // Determine active state
              onNavigate={handleOnNavigate}
            />
          ))}
          {AVAILABLE_LANGUAGES.length > 1 && (
            <h3 style={{
              margin: "0",
              marginLeft: "19px",
              padding: "0",
              opacity: showMenu ? "1" : "0",
              transition: "opacity 1s 0.2s"
            }}>
              {AVAILABLE_LANGUAGES.map((l, index) => (
                <span key={l}>
                  <Link
                    style={{ ...languageStyle, textDecoration: lang === l ? "underline" : "none", pointerEvents: showMenu ? "auto" : "none" }}
                    to={`/${l}/${location.pathname.replace(/^\/(en|sv)/, '').replace(/^\//, '')}${location.hash}`} // Replaces existing lang prefix or root slash
                    onClick={() => { if (isMobile) { setHamburgerOpen(false); } }}
                  >
                    {t(l).toUpperCase()}
                  </Link>
                  {index < AVAILABLE_LANGUAGES.length - 1 && " / "}
                </span>
              ))}
            </h3>
          )}
          {isMobile && (
            <div
              style={hamburgerStyle}
              onClick={() => setHamburgerOpen(!hamburgerOpen)}
            >
              <Lottie
                ref={hamburgerAnimation}
                play={false}
                loop={false}
                animationData={hamburger}
                style={{
                  height: isMobileXs ? "30px" : "35px",
                  width: isMobileXs ? "30px" : "35px",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

interface NavItemProps {
  name: string;
  isActive: boolean;
  show: boolean;
  onNavigate: (to: string) => void;
}

function NavItem({ name, isActive, show, onNavigate }: NavItemProps): React.ReactElement {
  const { t } = useTranslation();

  const navItemStyle: React.CSSProperties = {
    marginLeft: "19px",
    cursor: "pointer",
    opacity: show ? 1 : 0,
    transition: "opacity 1s 0.2s",
    pointerEvents: show ? "auto" : "none",
    textDecoration: isActive ? "underline" : "none",
    textUnderlineOffset: "4px",
  };

  return (
    <h3
      style={{ margin: "0", padding: "0" }}
      onClick={() => {
        if (show) {
          onNavigate(name);
        }
      }}
    >
      <span style={navItemStyle}>{t(name).toUpperCase()}</span>
    </h3>
  );
}

export default Navbar;
