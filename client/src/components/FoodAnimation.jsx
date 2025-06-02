import React, { useEffect, useRef, useState } from "react";
import { filename, useMobile } from "../utils";

function FoodAnimation({ character, type, styles, isPaused, always_on, currentSpeakerName }) {

  const isMobile = useMobile();
  const video = useRef(null);
  const [vidLoaded, setVidLoaded] = useState(false);

  const folder = character.name === "River" ? "" : isMobile ? "small/" : "large/";

  const transparency = type === "transparent";

  //This is to fix a problem on safari where videos are not shown at all until they are played.
  //So we play the video for a moment on component mount, and then go back to the normal behaviour
  useEffect(() => {
    async function startVid() {
      try{
        await video.current.play();
      }catch(e){
        //Sometimes video playing might fail due to being paused because it is a background tab etc.
        //But this is not a problem, just catch and proceed.
        console.log(e);//log for now but prob safe to fail silently
      }
      video.current.pause();
      setVidLoaded(true);
    };
    startVid();
  }, []);

  useEffect(() => {
    if (vidLoaded) {
      if (!isPaused && (currentSpeakerName === character.name || always_on === true)) {
        video.current.play().catch(e => console.log(e));//log for now but prob safe to fail silently
      } else {
        video.current.pause();
      }
    }
  }, [isPaused, vidLoaded, currentSpeakerName]);

  return (
    <video ref={video} style={{ ...styles, objectFit: "contain", height: "100%" }} loop muted playsInline>
      {transparency && <>
        <source
          src={`/characters/${folder}${filename(character.name)}-hevc-safari.mp4`}
          type={'video/mp4; codecs="hvc1"'} />
        <source
          src={`/characters/${folder}${filename(character.name)}-vp9-chrome.webm`}
          type={"video/webm"} />
      </>}
      {!transparency && 
      <source
        src={`/characters/${folder}${filename(character.name)}.webm`}
        type={"video/webm"} />
      }
    </video>
  );
}

export default FoodAnimation;
