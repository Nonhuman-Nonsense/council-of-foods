import React from "react";
import FoodAnimation from "./FoodAnimation";
import { filename, useSupportedViewheight } from "../utils";

function FoodItem({ food, index, total, currentSpeakerName, isPaused, zoomIn }) {

  const heightVariable = useSupportedViewheight();

  //Adjust these to adjust overall sizes
  const overviewSize = 12;
  const zoomInSize = 55;

  //These are the width of the cropped shadow files
  const videoSize = 800;
  const shadowSizes = {
    "Avocado": 865,
    "Banana": 1000,
    "Beer": 890,
    "Bean": 894,
    "Lollipop": 1021,
    "Maize": 915,
    "Meat": 824,
    "Mushroom": 969,
    "Potato": 850,
    "Tomato": 900,
    "Water": 1162
  };

  // Adjusted function to set width and height based on window width
  const getResponsiveFoodImageStyle = (shadow) => {
    const shadowMultiplier = shadow ? (shadowSizes[food.name] / videoSize) : 1;
    const size = (zoomIn && currentSpeakerName === food.name ? shadowMultiplier * zoomInSize * ((food.size - 1) / 2 + 1) + heightVariable : shadowMultiplier * overviewSize * food.size +  "vw"); // 12% of the window's width
    return {
      width: `${size}`,
      height: !shadow && `${size}`,
      animation: "2s foodAppearing",
      animationDelay: 0.4 * index + "s",
      animationFillMode: "both",
    };
  };

  const singleFoodStyle = {
    position: "relative",
    width: zoomInSize + heightVariable,
    height: zoomInSize + heightVariable,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
  };

  const foodItemStyle = (index, total) => {
    if(zoomIn && currentSpeakerName === food.name) {
      let baseHeight = -19;
      if (food.name === 'Lollipop') baseHeight = -22;
      if (food.name === 'Banana') baseHeight = -20;
      if (food.name === 'Beer') baseHeight = -18;
      return {...singleFoodStyle, top: baseHeight + heightVariable };
    }else{
      return overViewFoodItemStyle(index,total);
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

    if (food.name === 'Lollipop') top *= 1.05;
    if (food.name === 'Beer') top *= 0.97;

    const size = overviewSize + "vw";
    return {
      position: "absolute",
      left: `${left}%`,
      top: `${top}vw`,
      width: `${size}`,
      height: `${size}`,
      transform: "translate(-50%, -50%)",
      opacity: (zoomIn ? "0": "1"),
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-end",
    };
  };

  const foodImageShadowStyle = {
      zIndex: -1,
      position: "absolute",
  };

  const responsiveStyle = getResponsiveFoodImageStyle();

  return (
    <div style={foodItemStyle(index, total)}>
      <FoodAnimation food={food} styles={responsiveStyle} currentSpeakerName={currentSpeakerName} isPaused={isPaused} />
      <img
        src={`/foods/shadows/${filename(food.name)}.webp`}
        alt=""
        style={{ ...getResponsiveFoodImageStyle(true), ...foodImageShadowStyle }}
      />
    </div>
  );
}

export default FoodItem;
