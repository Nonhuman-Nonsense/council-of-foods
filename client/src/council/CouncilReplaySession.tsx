import type { Meeting } from "@shared/ModelTypes";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useAutoplayStore } from "@/autoplay/autoplayStore";
import { useRouting } from "@/navigation";
import { useButton } from "@/museum/button/useButton";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import type { BannerContent } from "@/museum/button/buttonStore";

interface CouncilReplaySessionProps {
  meeting: Meeting | null;
  liveKey: string | null;
  isPaused: boolean;
  language: string;
}

/**
 * Headless replay session: claims the button, drives the global banner store,
 * and navigates to root on press. Renders nothing — pair with ButtonBanner in
 * the council footer.
 */
export default function CouncilReplaySession({
  meeting,
  liveKey,
  isPaused,
  language,
}: CouncilReplaySessionProps): null {
  const navigate = useNavigate();
  const { rootPath } = useRouting();
  const isAutoplayActive = useAutoplayStore((state) => state.phase === "active");
  const replayActive = meeting != null && !liveKey;
  const replayButton = useButton("replay");
  const prevPressedRef = useRef(false);

  const replayBannerContent = useMemo((): BannerContent | undefined => {
    if (!replayActive || !meeting) {
      return undefined;
    }
    const meetingDate = new Date(meeting.date).toLocaleDateString(language, {
      dateStyle: "long",
    });
    return {
      kind: "replay",
      meetingId: meeting._id,
      meetingTitle: meeting.topic.title,
      meetingDate,
      isPaused,
    };
  }, [replayActive, meeting, language, isPaused]);

  useEffect(() => {
    if (!replayActive) {
      return;
    }
    replayButton.claim();
    return () => replayButton.release();
  }, [replayActive, replayButton.claim, replayButton.release]);

  useEffect(() => {
    if (!replayActive) {
      return;
    }
    replayButton.setLed("pulse");
  }, [replayActive, replayButton.setLed]);

  useButtonBanner({
    owner: "replay",
    sessionActive: replayActive,
    micOpen: false,
    isConnecting: false,
    bannerImmediate: true,
    bannerContent: replayBannerContent,
  });

  // Supplies banner content for the "autoplay" owner when in museum exhibition
  // mode. AutoplayCoordinator still holds the actual button claim at priority 3;
  // this only populates the banner data since CouncilReplaySession is the sole
  // holder of the meeting metadata needed to build the preamble.
  useButtonBanner({
    owner: "autoplay",
    sessionActive: isAutoplayActive && replayActive,
    micOpen: false,
    isConnecting: false,
    bannerImmediate: true,
    bannerContent: replayBannerContent,
  });

  useEffect(() => {
    if (!replayActive) {
      return;
    }

    const pressed = replayButton.pressed;
    const wasPressed = prevPressedRef.current;
    prevPressedRef.current = pressed;

    if (pressed && !wasPressed) {
      navigate(rootPath);
    }
  }, [replayActive, replayButton.pressed, navigate, rootPath]);

  return null;
}
