import React, { useEffect, useRef, useState } from "react";
import { filename } from "../utils";

function FoodAnimation({ character, styles, isPaused, currentSpeakerName }) {

  const video = useRef(null);
  const [vidLoaded, setVidLoaded] = useState(false);

  //This is to fix a problem on safari where videos are not shown at all until they are played.
  //So we play the video for a moment on component mount, and then go back to the normal behaviour
  useEffect(() => {
    async function startVid() {
      await video.current.play();
      video.current.pause();
      setVidLoaded(true);
    };
    startVid();
  }, []);

  useEffect(() => {
    if (vidLoaded) {
      if (!isPaused && (currentSpeakerName === character.name || character.name === "River")) {
        video.current.play();
      } else {
        video.current.pause();
      }
    }
  }, [isPaused, vidLoaded, currentSpeakerName]);

  return (
    <video ref={video} style={{ ...styles, objectFit: "contain", height: "100%" }} loop muted playsInline>
      {/* <source
        src={`/characters/videos/${filename(character.name)}-hevc-safari.mp4`}
        type={'video/mp4; codecs="hvc1"'} /> */}
      <source
        src={`/characters/videos/${filename(character.name)}.webm`}
        type={"video/webm"} />
    </video>
  );
}

export default FoodAnimation;
