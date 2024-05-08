import Lottie from 'react-lottie-player';
import rotate from '../animations/rotate.json';

function RotateDevice(){

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
      <h3>rotate your device</h3>
    </div>);
}

export default RotateDevice;
