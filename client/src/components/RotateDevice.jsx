import Lottie from 'react-lottie-player';
import rotate from '../animations/rotate.json';
import { useTranslation } from 'react-i18next';

function RotateDevice() {

  const { t } = useTranslation();

  const wrapper = {
    display: "flex",
    alignItems: "center",
    flexDirection: "column"
  };

  const styles = {
    width: "150px",
  };

  return (
    <div style={wrapper}>
      <Lottie play loop animationData={rotate} style={styles} />
      <h3>{t('rotate')}</h3>
    </div>);
}

export default RotateDevice;
