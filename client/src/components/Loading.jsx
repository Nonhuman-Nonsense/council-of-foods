import React from "react";
import Lottie from 'react-lottie-player';
import loading from '../animations/loading.json';
import { useMobile } from "../utils";

function Loading() {

  const isMobile = useMobile();

  return (
    <div style={{position: "absolute", top: "73vh"}}>
      <Lottie play loop animationData={loading} style={{height: isMobile ? "100px" : "150px"}} />
    </div>
  );
}

export default Loading;
