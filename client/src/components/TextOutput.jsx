import React, { useEffect } from "react";

function TextOutput({ conversation }) {
  const textOutputStyle = {
    fontFamily: "Arial, sans-serif",
  };

  useEffect(() => {
    console.log("Updated conversation:", conversation);
  }, [conversation]); // Make sure to use [conversation] to track changes properly

  // Check if the conversation has at least one message and display it, otherwise show a default message.
  // const firstMessageText =
  //   conversation.length > 0 ? conversation[0].text : "No messages yet.";

  return (
    <div>
      <h2 style={textOutputStyle}>
        {/* {firstMessageText} */}
        <br />
        Lorem ipsum dolor sit amet.
      </h2>
    </div>
  );
}

export default TextOutput;
