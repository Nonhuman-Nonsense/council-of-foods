import React from "react";

function ConversationControlIcon({
  name,
  tooltip,
  onClick
}) {

  const imageUrl = `/images/icons/${name}.svg`;


  const buttonStyle = {
    marginLeft: "4px",
    marginRight: "4px",
    width: "56px",
    height: "56px",
    border: "0",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  };

  const imageStyle = {
    width: "40px",
    height: "40px",
    objectFit: "cover",
    borderRadius: "50%",

  };

  return (
    <button style={buttonStyle} onClick={onClick}>
      <img
        src={imageUrl}
        alt={tooltip}
        style={imageStyle}
      />
    </button>
  );
}

export default ConversationControlIcon;
