import React from "react";

function NavItem({ name, onDisplayOverlay, isActive }) {
  const navItemStyle = {
    marginLeft: "25px",
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
        }}
      >
        {name.toUpperCase()}
      </a>
    </h3>
  );
}

export default NavItem;
