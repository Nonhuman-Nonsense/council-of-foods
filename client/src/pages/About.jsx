import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSocket } from "../components/SocketContext";
import { useCouncil } from "../components/CouncilContext";

function About() {
  const socket = useSocket();
  const { addTextMessage, addAudioMessage } = useCouncil();

  useEffect(() => {
    if (socket) {
      socket.on("conversation_update", (message) => {
        console.log("Getting message!");
        addTextMessage(message);
      });

      socket.on("audio_update", (audioMessage) => {
        console.log("Getting audio!");
        addAudioMessage(audioMessage);
      });

      return () => {
        socket.off("conversation_update");
        socket.off("audio_update");
      };
    }
  }, [socket, addTextMessage, addAudioMessage]);

  return (
    <>
      <h1 style={{ color: "black" }}>About page</h1>
      <Link to="/">
        <h2 style={{ color: "black" }}>Back to Home</h2>
      </Link>
    </>
  );
}

export default About;
