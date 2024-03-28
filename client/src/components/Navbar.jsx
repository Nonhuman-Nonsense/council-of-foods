import React from "react";
import NavItem from "./NavItem";
import { capitalizeFirstLetter } from "../utils";

function Navbar({ topic, activeOverlay, onDisplayOverlay }) {
  const navbarStyle = {
    paddingTop: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "start",
    color: "white",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    margin: "0 auto",
    width: "calc(90% + 40px)",
    pointerEvents: "auto",
  };

  const navItems = ["about", "settings", "contact", "share"];

  return (
    <nav style={navbarStyle} role="navigation">
      <div>
        <h3 style={{ margin: "0", padding: "0" }}>
          <a className="link" href="/">
            COUNCIL OF FOODS
          </a>
        </h3>
        <h4>{capitalizeFirstLetter(topic)}</h4>
      </div>
      <div style={{ display: "flex" }}>
        {navItems.map((item) => (
          <NavItem
            key={item}
            name={item}
            onDisplayOverlay={onDisplayOverlay}
            isActive={activeOverlay === item} // Determine active state
          />
        ))}
      </div>
    </nav>
  );
}

export default Navbar;
