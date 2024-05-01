import React, { useEffect, useRef } from "react";
import { filename } from "../utils";

function FoodAnimation({food, styles, currentSpeakerName, isPaused}) {

  const video = useRef(null);

  useEffect(() => {
    if(!isPaused && currentSpeakerName === food.name){
      video.current.play();
    }else{
      video.current.pause();
    }
  },[currentSpeakerName, isPaused])

  return (
    <video ref={video} style={{...styles, objectFit: "cover"}} loop muted playsInline>
      <source
        src={`/videos/foods/${filename(food.name)}-hevc-safari.mp4`}
        type={'video/mp4; codecs="hvc1"'} />
      <source
        src={`/videos/foods/${filename(food.name)}-vp9-chrome.webm`}
        type={"video/webm"}/>
      </video>
  );
}

export default FoodAnimation;
