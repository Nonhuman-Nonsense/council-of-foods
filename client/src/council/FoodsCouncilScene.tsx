import type { Character, Message } from "@shared/ModelTypes";
import type { DecodedAudioMessage } from "@shared/SocketTypes";
import React, { useMemo } from "react";
import FoodItem from "./FoodItem";
import { mapFoodIndex } from "@/utils";
import { backgroundImageUrls } from "@assets/backgrounds/index";
import { z } from "@/zIndexLayers";
import type { CouncilState } from "./hooks/useCouncilMachine";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";

interface FoodsCouncilSceneProps {
  participants: Character[];
  currentSpeakerId: string;
  councilState: CouncilState;
  playingNowIndex: number;
  textMessages: Message[];
  audioMessages: DecodedAudioMessage[];
  currentSnippetIndex: number;
  isPaused: boolean;
  /** Chair-conversation mode: camera stays on chair; performance follows agentSpeaking. */
  metaAgentActive: boolean;
  agentSpeaking: boolean;
}

export default function FoodsCouncilScene({
  participants,
  currentSpeakerId,
  councilState,
  playingNowIndex,
  textMessages,
  audioMessages,
  currentSnippetIndex,
  isPaused,
  metaAgentActive,
  agentSpeaking,
}: FoodsCouncilSceneProps) {
  const sentencesLength = useMemo(() => {
    const textMessage = textMessages[playingNowIndex];
    if (!textMessage) return 0;
    return audioMessages.find((a) => a.id === textMessage.id)?.sentences?.length ?? 0;
  }, [audioMessages, textMessages, playingNowIndex]);

  const zoomIn = useMemo(() => {
    if (metaAgentActive) return true;
    if (
      councilState === "loading" ||
      councilState === "waiting" ||
      councilState === "query_extension" ||
      councilState === "meeting_incomplete" ||
      councilState === "summary" ||
      councilState === "human_input" ||
      councilState === "human_panelist" ||
      playingNowIndex <= 0 ||
      textMessages[playingNowIndex]?.type === "human" ||
      textMessages[playingNowIndex]?.type === "panelist"
    ) {
      return false;
    } else if (currentSnippetIndex % 4 < 2 && currentSnippetIndex !== sentencesLength - 1) {
      return true;
    } else {
      return false;
    }
  }, [metaAgentActive, councilState, playingNowIndex, textMessages, currentSnippetIndex, sentencesLength]);

  const foods = useMemo(
    () => participants.filter((part) => !part.id.startsWith("panelist")),
    [participants]
  );

  const layoutSpeakerId = metaAgentActive ? CHAIR_ID : currentSpeakerId;

  const currentSpeakerIdx = useMemo(() => {
    let currentIndex: number | undefined;
    foods.forEach((food, index) => {
      if (layoutSpeakerId === food.id) {
        currentIndex = mapFoodIndex(foods.length, index);
      }
    });
    return currentIndex || 0;
  }, [foods, layoutSpeakerId]);

  return (
    <>
      <MemoizedBackground
        zoomIn={zoomIn}
        currentSpeakerIndex={currentSpeakerIdx}
        totalSpeakers={foods.length - 1}
      />
      <div
        style={{
          position: "absolute",
          top: "62%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: participants.length > 6 ? "79%" : "70%",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        {foods.map((food, index) => (
          <FoodItem
            key={food.id}
            food={food}
            index={mapFoodIndex(foods.length, index)}
            total={foods.length}
            isPaused={isPaused}
            zoomIn={zoomIn}
            currentSpeakerId={layoutSpeakerId}
            isPerforming={
              metaAgentActive
                ? food.id === CHAIR_ID && agentSpeaking
                : currentSpeakerId === food.id
            }
          />
        ))}
      </div>
    </>
  );
}

interface BackgroundProps {
  zoomIn: boolean;
  currentSpeakerIndex: number;
  totalSpeakers: number;
}

export function Background({ zoomIn, currentSpeakerIndex, totalSpeakers }: BackgroundProps) {
  function calculateBackdropPosition() {
    return 10 + (80 * currentSpeakerIndex) / totalSpeakers + "%";
  }

  const closeUpBackdrop: React.CSSProperties = {
    backgroundImage: `url(${backgroundImageUrls.closeUpBackdrop})`,
    backgroundSize: "cover",
    backgroundPosition: calculateBackdropPosition(),
    height: "100%",
    width: "100%",
    position: "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const closeUpTable: React.CSSProperties = {
    backgroundImage: `url(${backgroundImageUrls.closeUpTable})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100%",
    width: "100%",
    position: "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const bottomShade: React.CSSProperties = {
    width: "100%",
    height: "40%",
    position: "absolute",
    bottom: "0",
    background: "linear-gradient(0, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: z.councilSceneShade,
  };

  const topShade: React.CSSProperties = {
    width: "100%",
    height: "10%",
    position: "absolute",
    top: "0",
    background: "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: z.councilSceneShade,
  };

  return (
    <>
      <div style={closeUpBackdrop} />
      <div style={closeUpTable} />
      <div style={bottomShade} />
      <div style={topShade} />
    </>
  );
}

const MemoizedBackground = React.memo(Background);
