import React from "react";
import { capitalizeFirstLetter } from "../utils";

function Navbar({ topic }) {
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
    width: "calc(90% + 40px)", // Adjusted width
  };

  const navbarItemStyle = {
    margin: "0",
    padding: "0",
  };

  const linkItemStyle = {
    marginLeft: "25px",
  };

  return (
    <div style={navbarStyle}>
      <div>
        <h3 style={navbarItemStyle}>
          <a className="link" href="/">
            COUNCIL OF FOODS
          </a>
        </h3>
        <h4>{capitalizeFirstLetter(topic)}</h4>
      </div>
      <div style={{ display: "flex" }}>
        <h3 style={navbarItemStyle}>
          <a className="link" href="#" style={linkItemStyle}>
            ABOUT
          </a>
        </h3>
        <h3 style={navbarItemStyle}>
          <a className="link" href="#" style={linkItemStyle}>
            SETTINGS
          </a>
        </h3>
        <h3 style={navbarItemStyle}>
          <a className="link" href="#" style={linkItemStyle}>
            CONTACT
          </a>
        </h3>
        <h3 style={navbarItemStyle}>
          <a className="link" href="#" style={linkItemStyle}>
            SHARE
          </a>
        </h3>
      </div>
    </div>
  );
}

export default Navbar;
