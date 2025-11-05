import RotateDevice from '../RotateDevice';
import { useMediaQuery } from 'react-responsive'
import { useMobile, dvh } from "../../utils";

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
          <img style={{width: `18${dvh}`, maxWidth: "95px", minWidth: "54px"}} src='/logos/council_logo_white.svg' alt="Council of Foods logo" />
          <h2 style={{marginBottom: "-10px", marginTop: isMobile ? "0" : ""}}>welcome to</h2>
          <h1 style={{margin: isMobile ? "5px 0 0 0" : ""}}>COUNCIL OF FOODS</h1>
          <p>at</p>
          <a href="https://www.spiritofasilomar.org/"><img style={{height: `18${dvh}`, minHeight: "54px"}} src='/logos/SOA_PrimaryLogo_WHT.png' alt="The Spirit of Asilomar" /></a>
        </div>
        
        {isPortrait ?
          <RotateDevice />
        :
        (<div style={{maxWidth: "470px"}}>
          <p style={{marginBottom: isMobile ? "10px" : "20px"}}>Welcome to the Council of Foods, a political arena where food speaks—not just of the broken food system, but of the expanding frontiers of biotechnology. Join the discussion on the which actions need to be taken regarding the future of synthetic life!</p>
          <div><button onClick={() => onContinueForward()}>Let's go!</button></div>
        </div>)
        }
      </div>
    </div>
  );
}

export default Landing;
