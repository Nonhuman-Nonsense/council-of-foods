import React from "react";

function Navbar() {
  const navbarStyle = {
    paddingTop: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "white",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    margin: "0 auto",
    width: "90%",
  };

  const navbarItemStyle = {
    margin: "0",
    padding: "0",
  };

  const linkItemStyle = {
    marginLeft: "20px",
  };

  return (
    <div style={navbarStyle}>
      <h3 style={navbarItemStyle}>COUNCIL OF FOODS</h3>
      <div style={{ display: "flex" }}>
        <h3 style={{ ...navbarItemStyle, ...linkItemStyle }}>ABOUT</h3>
        <h3 style={{ ...navbarItemStyle, ...linkItemStyle }}>SETTINGS</h3>
        <h3 style={{ ...navbarItemStyle, ...linkItemStyle }}>CONTACT</h3>
        <h3 style={{ ...navbarItemStyle, ...linkItemStyle }}>SHARE</h3>
      </div>
    </div>
  );
}

export default Navbar;
