// import React, { useState, useEffect } from "react";

// function Council({ options }) {
//   const { humanName, topic, foods } = options;
//   const [screenWidth, setScreenWidth] = useState(window.innerWidth);

//   useEffect(() => {
//     const handleResize = () => {
//       setScreenWidth(window.innerWidth);
//     };

//     window.addEventListener("resize", handleResize);

//     return () => window.removeEventListener("resize", handleResize);
//   }, []);

//   const councilStyle = {
//     zIndex: 10,
//     color: "white",
//     textAlign: "center",
//     minHeight: "100vh",
//     display: "flex",
//     flexDirection: "column",
//     justifyContent: "end",
//     alignItems: "center",
//   };

//   const textAreaStyle = {
//     width: "90%",
//     transform: "translateY(-140px)", // Move the textarea up by 10px
//   };

//   const foodsContainerStyle = {
//     position: "absolute",
//     top: "50%",
//     left: "50%",
//     transform: "translate(-50%, -50%)",
//     width: "70%",
//     display: "flex",
//     justifyContent: "space-around",
//     alignItems: "center",
//   };

//   const foodImageStyle = {
//     width: "120px",
//     height: "120px",
//   };

//   const foodImageShadowStyle = (index, total) => {
//     let leftPosition = calculateLeftPosition(index, total);

//     // Determine the angle of rotation
//     const rotationAngle = leftPosition * 1.8;

//     return {
//       zIndex: -1,
//       position: "absolute",
//       top: "5px",
//       left: `${leftPosition}px`,
//       filter:
//         "blur(6px) brightness(0%) saturate(100%) invert(0%) sepia(100%) hue-rotate(180deg) contrast(100%)",
//       opacity: 0.3,
//       transformOrigin: "bottom center", // Set the origin to the bottom center
//       transform: `rotate(${rotationAngle}deg)`, // Apply rotation transformation
//     };
//   };

//   const calculateLeftPosition = (index, total) => {
//     const middleIndex = (total - 1) / 2;
//     const distanceIncrement = 10; // Adjust as needed
//     const distance = (index - middleIndex) * distanceIncrement; // Calculate distance from middle index
//     return distance; // Return distance as the left position
//   };

//   // Adjusted function to set width and height based on window width
//   const getResponsiveFoodImageStyle = () => {
//     const size = screenWidth * 0.05; // 5% of the window's width
//     return {
//       width: `${size}px`, // Dynamically set width
//       height: `${size}px`, // Dynamically set height
//     };
//   };

//   const foodItemStyle = (index, total) => {
//     const left = (index / (total - 1)) * 100;

//     const topMax = 2.25;
//     const topOffset = 9; // Vertical offset to adjust the curve's baseline

//     let middleIndex;
//     let isEven = total % 2 === 0;
//     if (isEven) {
//       middleIndex = total / 2 - 1;
//     } else {
//       middleIndex = (total - 1) / 2;
//     }

//     let a;
//     if (isEven) {
//       a = topMax / Math.pow(middleIndex + 0.5, 2);
//     } else {
//       a = topMax / Math.pow(middleIndex, 2);
//     }

//     let top;
//     if (isEven) {
//       const distanceFromMiddle = Math.abs(index - middleIndex - 0.5);
//       top = a * Math.pow(distanceFromMiddle, 2) + topMax - topOffset;
//     } else {
//       top = a * Math.pow(index - middleIndex, 2) + topMax - topOffset;
//     }

//     return {
//       position: "absolute",
//       left: `${left}%`,
//       top: `${top}vw`,
//       transform: "translate(-50%, -50%)",
//     };
//   };

//   return (
//     <div style={councilStyle}>
//       <textarea
//         className="text-input"
//         rows="5"
//         style={textAreaStyle}
//         disabled
//       ></textarea>
//       <div style={foodsContainerStyle}>
//         {foods.map((food, index) => (
//           <div key={index} style={foodItemStyle(index, foods.length)}>
//             <img
//               src={`/images/foods/${food}.png`}
//               style={getResponsiveFoodImageStyle()}
//             />
//             <img
//               src={`/images/foods/${food}.png`}
//               style={{
//                 ...getResponsiveFoodImageStyle(),
//                 ...foodImageShadowStyle(index, foods.length),
//                 backgroundImage: `url(/images/foods/${food}.png)`,
//               }}
//             />
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// export default Council;

import React from "react";
import FoodItem from "./FoodItem";
import useWindowSize from "../hooks/useWindowSize";

function Council({ options }) {
  const { foods } = options;
  const { width: screenWidth } = useWindowSize();

  const textAreaStyle = {
    width: "90%",
    transform: "translateY(-140px)",
  };

  const foodsContainerStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  return (
    <div className="wrapper">
      <div className="text-container">
        <textarea
          className="text-input"
          rows="5"
          style={textAreaStyle}
          disabled
        ></textarea>
        <div style={foodsContainerStyle}>
          {foods.map((food, index) => (
            <FoodItem
              key={index}
              food={food}
              index={index}
              total={foods.length}
              screenWidth={screenWidth}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Council;
