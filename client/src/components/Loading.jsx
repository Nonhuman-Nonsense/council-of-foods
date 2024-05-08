import React from "react";
import Lottie from 'react-lottie-player';
import loading from '../animations/loading.json';

function Loading() {

  return (
    <div style={{position: "absolute", top: "73vh"}}>
      <Lottie play loop animationData={loading} style={{height: "150px"}} />
    </div>
  );
}

export default Loading;
