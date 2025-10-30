import { filename, useMobile } from "../../utils";

function FoodButton({
  food,
  onSelectFood,
  onDeselectFood,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}) {
  const isMobile = useMobile();
  const isModerator = onSelectFood === undefined;

  const imageUrl = `/small/${filename(food.id)}.webp`;

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
    marginLeft: "4px",
    marginRight: "4px",
    width: isMobile ? "42px" :"56px",
    height: isMobile ? "42px" : "56px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: (isSelected ? "rgba(0,0,0,0.7)" : "transparent"),
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
