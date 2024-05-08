import React from "react";
import { Player } from '@lottiefiles/react-lottie-player';

function Animation({ src, style }) {

  const styles = {
      // position: "absolute",
      // top: "73vh",
      // objectFit: "cover"
  };


  return (
    <Player
      autoplay
      loop
      src={src}
      style={style}
       />
  );
}

export default Animation;
