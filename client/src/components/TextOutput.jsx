// import React, { useState, useEffect } from "react";

// function TextOutput({ currentTextMessage, currentAudioMessage }) {
//   const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
//   const [currentSnippet, setCurrentSnippet] = useState("");

//   // Reset the snippet index when a new message is received
//   useEffect(() => {
//     setCurrentSnippetIndex(0);

//     console.log("current message:", currentTextMessage);
//   }, [currentTextMessage]);

//   useEffect(() => {
//     if (currentTextMessage && currentTextMessage.text && currentAudioMessage) {
//       const text = currentTextMessage.text;
//       // Split the text into sentences, ignoring periods followed by a number
//       const sentences = text.split(/(?<=[.!?])(?=\s+(?![0-9]))/);
//       setCurrentSnippet(sentences[currentSnippetIndex]);

//       const interval = setInterval(() => {
//         setCurrentSnippetIndex((prevIndex) =>
//           prevIndex < sentences.length - 1 ? prevIndex + 1 : prevIndex
//         );
//       }, calculateDisplayTime(currentSnippet) * 1000);
//       return () => clearInterval(interval);
//     }
//   }, [
//     currentTextMessage,
//     currentSnippetIndex,
//     currentAudioMessage,
//     currentSnippet,
//   ]);

//   // Calculate the display time based on the number of characters in the snippet
//   const calculateDisplayTime = (text) => {
//     console.log("Text in calculateDisplayTime: ", text);

//     const baseTimePerCharacter = 0.06; // Adjust this value as needed
//     return Math.max(3, text.length * baseTimePerCharacter);
//   };

//   const paragraphStyle = {
//     fontFamily: "Arial, sans-serif",
//     fontSize: "25px",
//   };

//   const textStyle = {
//     width: "70%",
//     position: "absolute",
//     bottom: "50px",
//   };

//   return (
//     <div style={textStyle}>
//       <p style={paragraphStyle}>{currentSnippet}</p>
//     </div>
//   );
// }

// export default TextOutput;

import React, { useState, useEffect } from "react";

function TextOutput({ currentTextMessage, currentAudioMessage }) {
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentSnippet, setCurrentSnippet] = useState("");

  // Reset the snippet index and snippet when a new message is received
  useEffect(() => {
    setCurrentSnippetIndex(0);
    if (currentTextMessage?.text) {
      const sentences = currentTextMessage?.text.split(
        /(?<=[.!?])(?=\s+(?![0-9]))/
      );
      if (sentences.length > 0) {
        setCurrentSnippet(sentences[0]);
      } else {
        setCurrentSnippet("");
      }
    }
    console.log("current message:", currentTextMessage);
  }, [currentTextMessage]);

  useEffect(() => {
    if (currentSnippetIndex >= 0 && currentTextMessage?.text) {
      const text = currentTextMessage.text;
      const sentences = text.split(/(?<=[.!?])(?=\s+(?![0-9]))/);
      if (sentences.length > currentSnippetIndex) {
        setCurrentSnippet(sentences[currentSnippetIndex]);
      }
      const interval = setInterval(() => {
        setCurrentSnippetIndex((prevIndex) =>
          prevIndex < sentences.length - 1 ? prevIndex + 1 : prevIndex
        );
      }, calculateDisplayTime(sentences[currentSnippetIndex] || "") * 1000);

      return () => clearInterval(interval);
    }
  }, [currentSnippetIndex, currentTextMessage]);

  // Modify calculateDisplayTime to handle potential undefined or empty strings safely
  const calculateDisplayTime = (text) => {
    if (!text) {
      return 3; // Minimum display time if text is undefined or empty
    }
    console.log("Text in calculateDisplayTime: ", text);
    const baseTimePerCharacter = 0.06; // Adjust this value as needed
    return Math.max(3, text.length * baseTimePerCharacter);
  };

  const paragraphStyle = {
    fontFamily: "Arial, sans-serif",
    fontSize: "25px",
  };

  const textStyle = {
    width: "70%",
    position: "absolute",
    bottom: "50px",
  };

  return (
    <div style={textStyle}>
      <p style={paragraphStyle}>{currentSnippet}</p>
    </div>
  );
}

export default TextOutput;
