import Lottie from 'react-lottie-player';
import loading from '../animations/loading.json';
import { useMobile } from "../utils";

/**
 * Loading Component
 * 
 * Displays an animated Lottie spinner.
 * Centered vertically with a slight offset for visual balance.
 */
function Loading() {

  const isMobile = useMobile();

  return (
    <div style={{ position: "absolute", top: "84%", transform: "translate(0, -50%)" }}>
      <Lottie play loop animationData={loading} style={{ height: isMobile ? "100px" : "150px" }} />
    </div>
  );
}

export default Loading;
