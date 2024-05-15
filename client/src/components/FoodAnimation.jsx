import React, { useEffect, useRef, useState } from "react";
import { filename } from "../utils";

function FoodAnimation({food, styles, currentSpeakerName, isPaused}) {

  const video = useRef(null);
  const [vidLoaded,setVidLoaded] = useState(false);

  //This is to fix a problem on safari where videos are not shown at all until they are played.
  //So we play the video for a moment on component mount, and then go back to the normal behaviour
  useEffect(() => {
    async function startVid() {
      await video.current.play();
      video.current.pause();
      setVidLoaded(true);
    };
    startVid();
  },[]);

  useEffect(() => {
    if(vidLoaded){
      if(!isPaused && currentSpeakerName === food.name){
        video.current.play();
      }else{
        video.current.pause();
      }
    }
  },[currentSpeakerName, isPaused,vidLoaded, food.name]);

  return (
    <video ref={video} style={{...styles, objectFit: "cover"}} loop muted playsInline>
      <source
        src={`/foods/videos/${filename(food.name)}-hevc-safari.mp4`}
        type={'video/mp4; codecs="hvc1"'} />
      <source
        src={`/foods/videos/${filename(food.name)}-vp9-chrome.webm`}
        type={"video/webm"}/>
      </video>
  );
}

export default FoodAnimation;
