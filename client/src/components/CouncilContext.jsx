import React, { createContext, useContext, useState } from "react";

const CouncilContext = createContext();

export function CouncilProvider({ children }) {
  const [councilState, setCouncilState] = useState({
    initialized: false,
    humanName: "",
    topic: "",
    foods: [],
    textMessages: [],
    audioMessages: [],
    currentMessageIndex: 0,
  });

  // Ensure these handlers are correctly updating the state.
  const addTextMessage = (message) => {
    setCouncilState((prev) => ({
      ...prev,
      textMessages: [...prev.textMessages, message],
    }));
  };

  const addAudioMessage = (message) => {
    setCouncilState((prev) => ({
      ...prev,
      audioMessages: [...prev.audioMessages, message],
    }));
  };

  // Make sure that `setCouncilState` is included in the value object here
  return (
    <CouncilContext.Provider
      value={{
        councilState,
        addTextMessage,
        addAudioMessage,
        setCouncilState,
      }}
    >
      {children}
    </CouncilContext.Provider>
  );
}

export function useCouncil() {
  return useContext(CouncilContext);
}
