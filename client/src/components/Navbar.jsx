import React from "react";
import { capitalizeFirstLetter } from "../utils";

function Navbar({
  topic,
  activeOverlay,
  onDisplayOverlay,
  onRemoveOverlay,
  onDisplayResetWarning,
}) {

  const closeUrl = `/images/icons/close.svg`;

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

  const navItems = ["about", "settings", "contact", "share"];

  return (
    <nav style={navbarStyle} role="navigation">
      <div style={{textAlign: "left"}}>
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
        <h4 style={{marginTop: "5px"}}>{capitalizeFirstLetter(topic)}</h4>
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
              isActive={activeOverlay === item} // Determine active state
            />
          ))}
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

function NavItem({ name, onDisplayOverlay, isActive }) {
  const navItemStyle = {
    marginLeft: "19px",
    cursor: "pointer",
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
