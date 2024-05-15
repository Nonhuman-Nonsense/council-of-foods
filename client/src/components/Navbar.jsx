import React, { useState, useRef } from "react";

import { capitalizeFirstLetter, useMobile } from "../utils";
import Lottie from "react-lottie-player";
import hamburger from "../animations/hamburger.json";

function Navbar({ topic, activeOverlay, onDisplayOverlay, onNavigate }) {
  const isMobile = useMobile();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerAnimation = useRef(null);

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
          visibility: isMobile ? "hidden" : "visible",
        }}
      >
        <h3
          style={{
            margin: "0",
            padding: "0",
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          onClick={() => onNavigate("")}
        >
          COUNCIL OF FOODS
        </h3>
        <h4 style={{ marginTop: "5px" }}>{capitalizeFirstLetter(topic)}</h4>
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
              show={!isMobile || hamburgerOpen}
              isActive={activeOverlay === item} // Determine active state
              onNavigate={onNavigate}
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
