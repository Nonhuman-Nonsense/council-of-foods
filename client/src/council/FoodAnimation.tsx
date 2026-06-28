import { useEffect, useRef, useState } from "react";
import React from 'react';
import { characterTransparentVideoUrls } from "@assets/characters/characterData";

interface AnimationFood {
  id: string;
}

interface FoodAnimationProps {
  food: AnimationFood;
  styles: React.CSSProperties;
  isPerforming: boolean;
  isPaused: boolean;
}

/**
 * FoodAnimation Component
 * 
 * Renders the HTML5 video element for a food item.
 * Manages playback state (play/pause) based on speaker activity.
 * 
 * Core Logic:
 * - **Safari Fix**: Forces a brief play/pause to unlock video rendering on iOS/Safari.
 * - **Codec Support**: Provides both HEVC (Safari) and VP9 (Chrome/Firefox) sources.
 * - **Sync**: Plays video only while `isPerforming` is true.
 */
function FoodAnimation({ food, styles, isPerforming, isPaused }: FoodAnimationProps): React.ReactElement {

  const video = useRef<HTMLVideoElement>(null);
  const [vidLoaded, setVidLoaded] = useState<boolean>(false);

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

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
      if (!isPaused && isPerforming) {
        video.current.play().catch(e => console.log(e));//log for now but prob safe to fail silently
      } else {
        video.current.pause();
      }
    }
  }, [isPerforming, isPaused, vidLoaded]);

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  if (!food.id) {
    return <div style={styles}></div>;
  }

  const urls = characterTransparentVideoUrls(food.id, false);
  return (
    <video ref={video} style={{ ...styles, objectFit: "cover" }} loop muted playsInline data-testid="food-video">
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
