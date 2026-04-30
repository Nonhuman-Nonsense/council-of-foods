import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMobile } from "../utils";
import { characterTransparentVideoUrls } from "@assets/characters/characterData";

interface FoodAnimationProps {
  character: { id: string };
  styles: CSSProperties;
  isPaused: boolean;
  always_on?: boolean;
  currentSpeakerId: string;
}

function FoodAnimation({ character, styles, isPaused, always_on, currentSpeakerId }: FoodAnimationProps) {
  const isMobile = useMobile();
  const video = useRef<HTMLVideoElement>(null);
  const [vidLoaded, setVidLoaded] = useState(false);
  const hasCharacter = Boolean(character?.id);

  useEffect(() => {
    async function startVid() {
      if (video.current) {
        try {
          await video.current.play();
        } catch (e) {
          console.log(e);
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
        video.current.play().catch(e => console.log(e));
      } else {
        video.current.pause();
      }
    }
  }, [isPaused, vidLoaded, currentSpeakerId, character.id, always_on]);

  if (!hasCharacter) return null;

  const urls = characterTransparentVideoUrls(character.id, isMobile);
  return (
    <video ref={video} data-testid="food-video" style={{ ...styles, objectFit: "contain", height: "100%" }} loop muted playsInline>
      <source
        src={urls.hevc}
        type={'video/mp4; codecs="hvc1"'} />
      <source
        src={urls.vp9}
        type={"video/webm"} />
    </video>
  );
}

export default FoodAnimation;
