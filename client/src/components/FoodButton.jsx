import React from "react";

function FoodButton({
  food,
  onSelectFood,
  onDeselectFood,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}) {
  const isModerator = onSelectFood === undefined;

  const imageUrl = `/images/foods/${food.name}.png`;

  function handleClickFood() {
    if (!isModerator && (!selectLimitReached || isSelected)) {
      if (!isSelected) {
        onSelectFood?.(food);
      } else {
        onDeselectFood?.(food);
      }
    }
  }

  const buttonStyle = {
    marginLeft: "5px",
    marginRight: "5px",
    width: "75px",
    height: "75px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    cursor:
      isModerator || (selectLimitReached && !isSelected)
        ? "default"
        : "pointer",
    border: isModerator
      ? "4px solid white"
      : isSelected
      ? "2px solid white"
      : selectLimitReached
      ? "2px solid rgb(255,255,255,0.5)"
      : "2px solid rgb(255,255,255,0.5)",
  };

  const imageStyle = {
    width: "80%",
    height: "80%",
    objectFit: "cover",
    borderRadius: "50%",
  };

  return (
    <div
      className="food-button"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={buttonStyle}
      onClick={handleClickFood}
    >
      <img
        src={imageUrl}
        alt={food.name}
        style={imageStyle}
      />
    </div>
  );
}

export default FoodButton;