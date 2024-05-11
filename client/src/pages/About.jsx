import React from "react";
import { Link } from "react-router-dom";

function About() {
  return (
    <>
      <h1 style={{ color: "black" }}>About page</h1>
      <Link to="/">
        <h2 style={{ color: "black" }}>Back to Home</h2>
      </Link>
    </>
  );
}

export default About;
