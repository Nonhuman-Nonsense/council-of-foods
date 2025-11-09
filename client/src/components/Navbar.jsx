import { useState, useRef, useEffect } from "react";
import { useLocation, Link, useParams, useNavigate } from "react-router";
import { useMediaQuery } from 'react-responsive'
import { useTranslation } from 'react-i18next';
import { capitalizeFirstLetter, useMobile, useMobileXs, usePortrait } from "../utils";
import Lottie from "react-lottie-player";
import hamburger from "../animations/hamburger.json";

function Navbar({ topic, hamburgerOpen, setHamburgerOpen }) {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const isPortrait = usePortrait();
  const showIconinMeny = useMediaQuery({ query: '(min-width: 700px)' });
  const hamburgerAnimation = useRef(null);
  const [activeMenuItem, setActiveMenuItem] = useState('');
  // eslint-disable-next-line
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  let { lang } = useParams();


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

  function handleOnNavigate(to) {
    navigate({
      hash: to
    });

    if (isMobile) {
      //If something is clicked in the menu on mobile, close the hamburger to give more space for content
      setHamburgerOpen(false);
    }
  }

  const navbarStyle = {
    padding: isMobile ? (isMobileXs ? "15px 15px 0 15px" : "20px 20px 0 20px") : "20px",
    display: isPortrait ? "none" : "flex",
    justifyContent: "space-between",
    alignItems: "start",
    color: "white",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
    zIndex: "10",
    height: isMobile && isMobileXs ? "45px" : "60px",
    pointerEvents: "none"
  };

  const hamburgerStyle = {
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

  const languageStyle = {
    cursor: "pointer",
    opacity: "1",
    transitionProperty: "opacity",
    transitionDuration: "1s",
    transitionDelay: "0.2s",
    pointerEvents: "auto",
    textUnderlineOffset: "4px",
  };

  const navItems = ["settings", "about", "contact"];

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
        {location.pathname.length > 4 && <>
          <div>
            <h3
              style={{
                margin: "0",
                padding: "0",
                cursor: "pointer",
                visibility: showIconinMeny ? "visible" : "hidden",
              }}
              onClick={() => handleOnNavigate( "reset" )}
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
              show={(!isMobile || hamburgerOpen) && (item !== 'settings' || location.pathname.substring(4).startsWith('meeting'))}
              isActive={activeMenuItem === `#${item}`} // Determine active state
              onNavigate={handleOnNavigate}
            />
          ))}
          <h3 style={{ margin: "0", padding: "0" }}>
            <Link style={{ ...languageStyle, marginLeft: "19px", textDecoration: lang === 'en' ? "underline" : "none" }} to={`/en/${location.pathname.substring(4)}${location.hash}`} >{t('en').toUpperCase()}</Link>/
            <Link style={{ ...languageStyle, textDecoration: lang === 'sv' ? "underline" : "none" }} to={`/sv/${location.pathname.substring(4)}${location.hash}`}>{t('sv').toUpperCase()}</Link>
          </h3>
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

function NavItem({ name, isActive, show, onNavigate }) {
  const { t } = useTranslation();

  const navItemStyle = {
    marginLeft: "19px",
    cursor: "pointer",
    opacity: show ? "1" : "0",
    transitionProperty: "opacity",
    transitionDuration: "1s",
    transitionDelay: "0.2s",
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
