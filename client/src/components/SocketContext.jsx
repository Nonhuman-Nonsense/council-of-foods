import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import io from "socket.io-client";

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io();
    setSocket(socketRef.current); // Update state to trigger re-render
    console.log("Socket initialized: ", socketRef.current);

    return () => {
      if (socketRef.current) {
        console.log("Disconnecting socket: ", socketRef.current);
        socketRef.current.disconnect();
        socketRef.current = null; // Clean up the ref
      }
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
