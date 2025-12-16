import Lottie from 'react-lottie-player';
import rotate from '@animations/rotate.json';
import { useTranslation } from 'react-i18next';

/**
 * RotateDevice Component
 * 
 * Displays an animation instructing the user to rotate their device.
 * Used when the device is in portrait mode but the application requires landscape.
 */
function RotateDevice(): React.ReactElement {

  const { t } = useTranslation();

  const wrapper: React.CSSProperties = {
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
