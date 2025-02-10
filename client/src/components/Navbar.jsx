import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, createSearchParams, useSearchParams } from "react-router-dom";

import { capitalizeFirstLetter, useMobile } from "../utils";
import Lottie from "react-lottie-player";
import hamburger from "../animations/hamburger.json";

function Navbar({ topic, activeOverlay, onDisplayOverlay }) {
  const isMobile = useMobile();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerAnimation = useRef(null);
  const [activeMenuItem, setActiveMenuItem] = useState('');
  // eslint-disable-next-line
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {    
    if(searchParams.get('o') === 'about'){
      setActiveMenuItem('about');
    }else if(searchParams.get('o') === 'contact'){
      setActiveMenuItem('contact');
    }else if(searchParams.get('o') === 'settings'){
      setActiveMenuItem('settings');
    }else{
      setActiveMenuItem('');
    }
  },[searchParams]);

  const openHamburger = () => {
    if (hamburgerOpen) {
      hamburgerAnimation.current.setDirection(-1);
      hamburgerAnimation.current.play();
    } else {
      hamburgerAnimation.current.setDirection(1);
      hamburgerAnimation.current.play();
    }
    setHamburgerOpen(!hamburgerOpen);
  };

  function handleOnNavigate(adress) {
    navigate({
      search: createSearchParams({
        o: adress
      }).toString()
    });
  }

  const navbarStyle = {
    padding: "20px",
    display: "flex",
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
  };

  const hamburgerStyle = {
    cursor: "pointer",
    width: "50px",
    height: "50px",
    margin: "-12px",
    marginLeft: "5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    pointerEvents: "auto",
  };

  const navItems = ["settings", "about", "contact"];

  return (
    <nav
      style={navbarStyle}
      role="navigation"
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
          <img style={{ width: '75px', marginRight: "10px", marginTop: "7px", cursor: "pointer" }} onClick={() => handleOnNavigate("reset")} src='/logos/council_logo_white.svg' alt="Council of Foods logo" />
          <div>
            <h3
              style={{
                margin: "0",
                padding: "0",
                cursor: "pointer"
              }}
              onClick={() => handleOnNavigate("reset")}
            >
              COUNCIL OF FOODS
            </h3>
            <h4 style={{ marginTop: "5px" }}>{capitalizeFirstLetter(topic)}</h4>
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
              onDisplayOverlay={onDisplayOverlay}
              show={(!isMobile || hamburgerOpen) && (item !== 'settings' || location.pathname.startsWith('/meeting'))}
              isActive={activeMenuItem === item} // Determine active state
              onNavigate={handleOnNavigate}
            />
          ))}
          {isMobile && (
            <div
              style={hamburgerStyle}
              onClick={openHamburger}
            >
              <Lottie
                ref={hamburgerAnimation}
                play={false}
                loop={false}
                animationData={hamburger}
                style={{ height: "35px", width: "35px" }}
              />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavItem({ name, isActive, show, onDisplayOverlay, onNavigate }) {
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
        onNavigate(name);
      }}
    >
      <span style={navItemStyle}>{name.toUpperCase()}</span>
    </h3>
  );
}

export default Navbar;
