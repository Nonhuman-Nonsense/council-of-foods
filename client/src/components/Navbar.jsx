import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";

import { capitalizeFirstLetter, useMobile } from "../utils";
import Lottie from "react-lottie-player";
import hamburger from "../animations/hamburger.json";

function Navbar({
  topic,
  activeOverlay,
  onDisplayOverlay,
  onRemoveOverlay,
  onDisplayResetWarning,
}) {
  const isMobile = useMobile();

  const closeUrl = `/icons/close.svg`;
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
    pointerEvents: "auto",
    zIndex: "10",
  };

  const closeStyle = {
    cursor: "pointer",
    marginTop: "18px",
    width: "35px",
    height: "35px",
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
  };

  const navItems = ["settings", "share"];

  return (
    <nav
      style={navbarStyle}
      role="navigation"
    >
      <div style={{ textAlign: "left", visibility: isMobile && "hidden" }}>
        <h3 style={{ margin: "0", padding: "0" }}>
          <a
            className="link"
            onClick={(e) => {
              e.preventDefault();
              onDisplayResetWarning();
            }}
          >
            COUNCIL OF FOODS
          </a>
        </h3>
        <h4 style={{ marginTop: "5px" }}>{capitalizeFirstLetter(topic)}</h4>
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "end" }}
      >
        <div style={{ display: "flex" }}>
          <Link to="about">About</Link>
          <Link to="contact">Contact</Link>
          {navItems.map((item) => (
            <NavItem
              key={item}
              name={item}
              onDisplayOverlay={onDisplayOverlay}
              show={!isMobile || hamburgerOpen}
              isActive={activeOverlay === item} // Determine active state
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
        {activeOverlay !== "" && (
          <img
            src={closeUrl}
            style={closeStyle}
            onClick={onRemoveOverlay}
          />
        )}
      </div>
    </nav>
  );
}

function NavItem({ name, onDisplayOverlay, isActive, show }) {
  const navItemStyle = {
    marginLeft: "19px",
    cursor: "pointer",
    opacity: show ? "1" : "0",
    transitionProperty: "opacity",
    transitionDuration: "1s",
    transitionDelay: "0.2s",
    pointerEvents: show ? "auto" : "none",
  };

  return (
    <h3 style={{ margin: "0", padding: "0" }}>
      <a
        className="link"
        href="#"
        onClick={(e) => {
          e.preventDefault(); // Prevent default anchor action
          onDisplayOverlay(name); // Trigger overlay display
        }}
        style={{
          ...navItemStyle,
          textDecoration: isActive ? "underline" : "none", // Underline if active
          textUnderlineOffset: "4px",
        }}
      >
        {name.toUpperCase()}
      </a>
    </h3>
  );
}

export default Navbar;
