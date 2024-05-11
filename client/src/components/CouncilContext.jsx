import React, { createContext, useContext, useState } from "react";

// Create a Context
const CouncilContext = createContext();

export function CouncilProvider({ children }) {
  const [councilState, setCouncilState] = useState({
    // Initialize with any default values you need
    initialized: false,
    humanName: "",
    topic: "",
    foods: [],
    textMessages: [],
    audioMessages: [],
    currentMessageIndex: 0,
  });

  return (
    <CouncilContext.Provider value={{ councilState, setCouncilState }}>
      {children}
    </CouncilContext.Provider>
  );
}

// Custom hook to use the council state
export function useCouncil() {
  return useContext(CouncilContext);
}
