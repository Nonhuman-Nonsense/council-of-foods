import FoodAnimation from "./FoodAnimation";
import { dvh } from "../utils";

const videoBaseSize = 800;
const videoWithShadowSize = {
  "avocado": 1080,
  "banana": 1080,
  "beer": 1080,
  "bean": 1080,
  "lollipop": 1080,
  "maize": 1080,
  "meat": 1080,
  "mushroom": 1080,
  "potato": 1080,
  "tomato": 1080,
  "water": 1080,
  "kale": 1000,
  "honey": 800
};

function FoodItem({ food, index, total, currentSpeakerId, isPaused, zoomIn }) {

  //Adjust these to adjust overall sizes
  const overviewSize = 12;
  const zoomInSize = 55;

  let videoSize = videoWithShadowSize[food.id];

  // Adjusted function to set width and height based on window width
  const getResponsiveFoodImageStyle = () => {
    const size = (zoomIn && currentSpeakerId === food.id ? zoomInSize * ((food.size - 1) / 2 + 1) : overviewSize * food.size); // 12% of the window's width
    const sizeUnit = zoomIn && currentSpeakerId === food.id ? dvh : "vw";
    return {
      width: `${size * videoSize / videoBaseSize + sizeUnit}`,
      height: `${size + sizeUnit}`,
      animation: "2s foodAppearing",
      animationDelay: 0.4 * index + "s",
      animationFillMode: "both",
    };
  };

  const singleFoodStyle = {
    position: "relative",
    width: zoomInSize + dvh,
    height: zoomInSize + dvh,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
  };

  const foodItemStyle = (index, total) => {
    if (zoomIn && currentSpeakerId === food.id) {
      let baseHeight = -19;
      // Manual vertical adjustments for zoomed in view
      if (food.id === 'lollipop') baseHeight = -22;
      if (food.id === 'banana') baseHeight = -20;
      if (food.id === 'honey') baseHeight = -18;
      if (food.id === 'beer') baseHeight = -18;
      return { ...singleFoodStyle, top: baseHeight + dvh };
    } else {
      return overViewFoodItemStyle(index, total);
    }
  };

  const overViewFoodItemStyle = (index, total) => {
    const left = (index / (total - 1)) * 100;

    const topMax = 3.0; // The curvature
    const topOffset = 14.5; // Vertical offset to adjust the curve's baseline

    let middleIndex;
    let isEven = total % 2 === 0;
    if (isEven) {
      middleIndex = total / 2 - 1;
    } else {
      middleIndex = (total - 1) / 2;
    }

    let a;
    if (isEven) {
      a = topMax / Math.pow(middleIndex + 0.5, 2);
    } else {
      a = topMax / Math.pow(middleIndex, 2);
    }

    let top;
    if (isEven) {
      const distanceFromMiddle = Math.abs(index - middleIndex - 0.5);
      top = a * Math.pow(distanceFromMiddle, 2) + topMax - topOffset;
    } else {
      top = a * Math.pow(index - middleIndex, 2) + topMax - topOffset;
    }

    // Manual vertical adjustments for overview
    if (food.id === 'lollipop') top *= 1.05;
    if (food.id === 'beer') top *= 0.97;
    if (food.id === 'honey') top *= 0.95;

    return {
      position: "absolute",
      left: `${left}%`,
      top: `${top}vw`,
      width: `${videoSize / videoBaseSize * overviewSize + "vw"}`,
      height: `${overviewSize + "vw"}`,
      transform: "translate(-50%, -50%)",
      opacity: (zoomIn ? "0" : "1"),
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-end",
    };
  };

  const responsiveStyle = getResponsiveFoodImageStyle();

  return (
    <div style={foodItemStyle(index, total)}>
      <FoodAnimation food={food} styles={responsiveStyle} currentSpeakerId={currentSpeakerId} isPaused={isPaused} />
    </div>
  );
}

export default FoodItem;