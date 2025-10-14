import RotateDevice from '../RotateDevice';
import { useMediaQuery } from 'react-responsive'
import { useMobile } from "../../utils";

function Landing({ onContinueForward }) {

  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })
  const isMobile = useMobile();

  const wrapper = {
    position: "absolute",
    width: "100%",
    height: "100%",
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
          <h2 style={{marginBottom: "-10px", marginTop: isMobile ? "0" : ""}}>welcome to</h2>
          <h1 style={{margin: isMobile ? "5px 0 0 0" : ""}}>COUNCIL OF FOREST</h1>
        </div>
        
        {isPortrait ?
          <RotateDevice />
        :
        (<div style={{maxWidth: "380px"}}>
          <p style={{marginBottom: "30px"}}>A political arena where the forest itself speaks, through the use of artificial intelligence. Join the forest’s inhabitants as they debate deforestation, rewilding, and the fate of their shared home.</p>
          <div><button onClick={() => onContinueForward()}>Let's go!</button></div>
        </div>)
        }
      </div>
    </div>
  );
}

export default Landing;
