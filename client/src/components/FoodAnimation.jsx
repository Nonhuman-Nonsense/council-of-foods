import { useEffect, useRef, useState } from "react";

function FoodAnimation({ food, styles, currentSpeakerId, isPaused }) {

  const video = useRef(null);
  const [vidLoaded, setVidLoaded] = useState(false);

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
      if (!isPaused && currentSpeakerId === food.id) {
        video.current.play().catch(e => console.log(e));//log for now but prob safe to fail silently
      } else {
        video.current.pause();
      }
    }
  }, [currentSpeakerId, isPaused, vidLoaded, food.id]);

  return (
    <video ref={video} style={{ ...styles, objectFit: "cover" }} loop muted playsInline>
      <source
        src={`/foods/videos/${food.id}-hevc-safari.mp4`}
        type={'video/mp4; codecs="hvc1"'} />
      <source
        src={`/foods/videos/${food.id}-vp9-chrome.webm`}
        type={"video/webm"} />
    </video>
  );
}

export default FoodAnimation;
