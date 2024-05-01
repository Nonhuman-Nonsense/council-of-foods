import React from "react";
import FoodAnimation from "./FoodAnimation";
import { filename } from "../utils";

function FoodItem({ food, index, total, screenWidth, currentSpeakerName, isPaused }) {
  const foodImageStyle = {
    width: "120px",
    height: "120px",
  };

  const calculateLeftPosition = (index, total) => {
    const middleIndex = (total - 1) / 2;
    const distanceIncrement = 10; // Adjust as needed
    const distance = (index - middleIndex) * distanceIncrement; // Calculate distance from middle index
    return distance; // Return distance as the left position
  };

  const foodImageShadowStyle = (index, total) => {
    let leftPosition = calculateLeftPosition(index, total);

    // Determine the angle of rotation
    const rotationAngle = leftPosition * 1.8;

    return {
      zIndex: -1,
      position: "absolute",
      top: "5px",
      left: `${leftPosition}px`,
      filter:
        "blur(6px) brightness(0%) saturate(100%) invert(0%) sepia(100%) hue-rotate(180deg) contrast(100%)",
      opacity: 0.3,
      transformOrigin: "bottom center", // Set the origin to the bottom center
      transform: `rotate(${rotationAngle}deg)`, // Apply rotation transformation
    };
  };

  // Adjusted function to set width and height based on window width
  const getResponsiveFoodImageStyle = () => {
    const size = screenWidth * 0.12; // 5% of the window's width
    return {
      width: `${size}px`, // Dynamically set width
      height: `${size}px`, // Dynamically set height
      animation: "2s foodAppearing",
      animationDelay: 0.4 * index + "s",
      animationFillMode: "both",
    };
  };

  const foodItemStyle = (index, total) => {
    const left = (index / (total - 1)) * 100;

    const topMax = 3.0; // The curvature
    const topOffset = 14; // Vertical offset to adjust the curve's baseline

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

    return {
      position: "absolute",
      left: `${left}%`,
      top: `${top}vw`,
      transform: "translate(-50%, -50%)",
    };
  };

  // You can now move the logic for `foodItemStyle`, `getResponsiveFoodImageStyle`, and `foodImageShadowStyle` here if they don't depend on the other props
  const responsiveStyle = getResponsiveFoodImageStyle(screenWidth); // Assuming this function is adapted to use `screenWidth` directly

  return (
    <div style={foodItemStyle(index, total)}>
      {
        ["Potato", "Beer", "Water", "Banana", "Tomato", "Meat", "Broad Bean", "Maize","Mushroom"].includes(food.name) ?
        <FoodAnimation food={food} styles={responsiveStyle} currentSpeakerName={currentSpeakerName} isPaused={isPaused} /> :
        <img
        src={`/images/foods/${filename(food.name)}-shadow.png`}
        style={responsiveStyle} />
      }
      {/* <img
        src={`/images/foods/${food.name}.png`}
        style={{ ...responsiveStyle, ...foodImageShadowStyle(index, total) }}
      /> */}
    </div>
  );
}

export default FoodItem;
