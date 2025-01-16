import React from "react";
import RotateDevice from '../RotateDevice';
import { useMediaQuery } from 'react-responsive'

function Landing({ onContinueForward }) {

  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })

  const wrapper = {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const welcomeStyle = {
    display: "flex",
    flexDirection: "column",
    height: "85%",
    alignItems: "center",
    justifyContent: "space-between",
  };

  return (
    <div style={wrapper}>
      <div style={welcomeStyle}>

        <div>
          <img style={{width: '95px'}} src='/logos/council_logo_white.svg' alt="Council of Foods logo" />
          <h2 style={{marginBottom: "-10px"}}>welcome to</h2>
          <h1>COUNCIL OF FOODS</h1>
        </div>
        
        {isPortrait ?
          <RotateDevice />
        :
        (<div style={{maxWidth: "380px"}}>
          <p style={{marginBottom: "30px"}}>A political arena where the foods themselves discuss the broken food system, through the use of artificial intelligence. Join the discussion on what actions need to be taken to form a locally and globally sustainable food system!</p>
          <div><button onClick={() => onContinueForward()}>Let's go!</button></div>
        </div>)
        }
      </div>
    </div>
  );
}

export default Landing;
