import React, { useEffect, useRef } from "react";

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
        src={`/videos/foods/${food.name}-hevc-safari.mp4`}
        type={'video/mp4; codecs="hvc1"'} />
      <source
        src={`/videos/foods/${food.name}-vp9-chrome.webm`}
        type={"video/webm"}/>
      </video>
  );
}

export default FoodAnimation;
