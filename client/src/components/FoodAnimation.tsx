import { useEffect, useRef, useState } from "react";
import { filename, useMobile } from "../utils";
import { Character } from "@shared/ModelTypes";

interface FoodAnimationProps {
  character: Character;
  type: string;
  styles: React.CSSProperties;
  isPaused: boolean;
  always_on?: boolean;
  currentSpeakerId: string;
}

function FoodAnimation({ character, type, styles, isPaused, always_on, currentSpeakerId }: FoodAnimationProps) {
  if (!character?.id) return null;

  const isMobile = useMobile();
  const video = useRef<HTMLVideoElement>(null);
  const [vidLoaded, setVidLoaded] = useState(false);

  // Forest-specific logic: River has no subfolder, others do based on device size
  const folder = character.id === "river" ? "" : isMobile ? "small/" : "large/";
  const transparency = type === "transparent";

  //This is to fix a problem on safari where videos are not shown at all until they are played.
  //So we play the video for a moment on component mount, and then go back to the normal behaviour
  useEffect(() => {
    async function startVid() {
      if (video.current) {
        try {
          await video.current.play();
        } catch (e) {
          //Sometimes video playing might fail due to being paused because it is a background tab etc.
          //But this is not a problem, just catch and proceed.
          console.log(e);//log for now but prob safe to fail silently
        }
        video.current.pause();
        setVidLoaded(true);
      }
    };
    startVid();
  }, []);

  useEffect(() => {
    if (vidLoaded && video.current) {
      if (!isPaused && (currentSpeakerId === character.id || always_on === true)) {
        video.current.play().catch(e => console.log(e));//log for now but prob safe to fail silently
      } else {
        video.current.pause();
      }
    }
  }, [isPaused, vidLoaded, currentSpeakerId, character.id, always_on]);

  return (
    <video ref={video} data-testid="food-video" style={{ ...styles, objectFit: "contain", height: "100%" }} loop muted playsInline>
      {transparency && <>
        <source
          src={`/characters/${folder}${filename(character.id)}-hevc-safari.mp4`}
          type={'video/mp4; codecs="hvc1"'} />
        <source
          src={`/characters/${folder}${filename(character.id)}-vp9-chrome.webm`}
          type={"video/webm"} />
      </>}
      {!transparency &&
        <source
          src={`/characters/${folder}${filename(character.id)}.webm`}
          type={"video/webm"} />
      }
    </video>
  );
}

export default FoodAnimation;
