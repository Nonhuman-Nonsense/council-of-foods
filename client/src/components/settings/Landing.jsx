import RotateDevice from '../RotateDevice';
import { useMediaQuery } from 'react-responsive'
import { useMobile } from "../../utils";
import { useTranslation } from 'react-i18next';

function Landing({ onContinueForward }) {

  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })
  const isMobile = useMobile();
  const { t } = useTranslation();

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
          <h2 style={{marginBottom: "-10px", marginTop: isMobile ? "0" : ""}}>{t('welcome')}</h2>
          <h1 style={{margin: isMobile ? "5px 0 0 0" : ""}}>{t('council').toUpperCase()}</h1>
        </div>
        
        {isPortrait ?
          <RotateDevice />
        :
        (<div style={{maxWidth: "380px"}}>
          <p style={{marginBottom: "30px"}}>{t('description')}</p>
          <div><button onClick={() => onContinueForward()}>{t('go')}</button></div>
        </div>)
        }
      </div>
    </div>
  );
}

export default Landing;
