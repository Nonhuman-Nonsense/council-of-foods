import React, { useEffect, useRef, useState } from "react";

function Test() {
  const riverRef = useRef(null);
  const [riverWidth, setRiverWidth] = useState(0);

  useEffect(() => {
    if (riverRef.current) {
      const updateRiverWidth = () => {
        setRiverWidth(riverRef.current.offsetWidth);
      };

      riverRef.current.addEventListener("load", updateRiverWidth);
      window.addEventListener("resize", updateRiverWidth);

      if (riverRef.current.complete) {
        updateRiverWidth();
      }

      return () => {
        if (riverRef.current) {
          riverRef.current.removeEventListener("load", updateRiverWidth);
        }
        window.removeEventListener("resize", updateRiverWidth);
      };
    }
  }, []);

  const styles = {
    container: {
      width: "100%",
      overflow: "hidden",
    },
    halfContainerLeft: {
      width: `calc(50vw + ${riverWidth * 0.5}px)`,
      position: "fixed",
      backgroundColor: "rgba(255, 192, 203, 0.3)",
      overflow: "hidden",
      left: 0,
      top: 0,
    },
    halfContainerRight: {
      width: `calc(50vw + ${riverWidth * 0.5}px)`,
      position: "fixed",
      backgroundColor: "rgba(173, 216, 230, 0.3)",
      overflow: "hidden",
      right: 0,
      top: 0,
    },
    riverImageRight: {
      maxWidth: "100%",
      shapeOutside: "url('/test/river-with-alpha.png')",
      float: "right",
    },
    riverImageLeft: {
      maxWidth: "100%",
      shapeOutside: "url('/test/river-with-alpha.png')",
      float: "left",
      display: "hidden",
    },
    testBox: {
      height: "150px",
      width: "150px",
      display: "inline-block",
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.halfContainerLeft}
        className="test-wrapper-left"
      >
        <img
          ref={riverRef}
          alt="Test river left"
          src="/test/river-with-alpha.png"
          style={styles.riverImageRight}
        />
        <div style={{ ...styles.testBox, backgroundColor: "red" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "green" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "blue" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "red" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "green" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "blue" }}></div>
      </div>

      <div
        style={styles.halfContainerRight}
        className="test-wrapper-right"
      >
        <img
          ref={riverRef}
          alt="Test river right"
          src="/test/river-with-alpha.png"
          style={styles.riverImageLeft}
        />
        <div style={{ ...styles.testBox, backgroundColor: "purple" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "orange" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "teal" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "purple" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "orange" }}></div>
        <div style={{ ...styles.testBox, backgroundColor: "teal" }}></div>
      </div>
    </div>
  );
}

export default Test;
