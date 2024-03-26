import React from "react";

function FoodButton({
  name,
  onSelectFood,
  onDeselectFood,
  isSelected,
  selectLimitReached,
}) {
  const isModerator = onSelectFood === undefined;

  const imageUrl = `/images/foods/${name}.png`;

  function handleClickFood() {
    if (!isModerator && (!selectLimitReached || isSelected)) {
      if (!isSelected) {
        onSelectFood?.(name);
      } else {
        onDeselectFood?.(name);
      }
    }
  }

  const buttonStyle = {
    marginLeft: "5px",
    marginRight: "5px",
    backgroundColor: "black",
    width: "75px",
    height: "75px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: isModerator // Use isModerator to determine border style
      ? "4px solid white"
      : isSelected
      ? "2px solid white"
      : selectLimitReached
      ? "2px solid transparent"
      : "2px solid transparent",
  };

  const imageStyle = {
    width: "80%",
    height: "80%",
    objectFit: "cover",
    cursor:
      isModerator || (selectLimitReached && !isSelected)
        ? "default"
        : "pointer",
    borderRadius: "50%",
  };

  return (
    <div className="food-button" style={buttonStyle} onClick={handleClickFood}>
      <img src={imageUrl} alt={name} style={imageStyle} />
    </div>
  );
}

export default FoodButton;
