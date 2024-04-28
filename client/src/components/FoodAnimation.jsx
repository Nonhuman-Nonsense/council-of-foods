import React, { useEffect, useRef } from "react";

function FoodAnimation({food, styles, currentSpeakerName}) {

  const video = useRef(null);

  useEffect(() => {
    if(currentSpeakerName === food.name){
      video.current.play();
    }else{
      video.current.pause();
    }
  },[currentSpeakerName])

  return (
    <video ref={video} width={styles.width} height={styles.height} style={{objectFit: "cover"}} loop muted playsInline>
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
