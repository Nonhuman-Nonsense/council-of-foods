import { useMobile, useMobileXs } from "../utils";

function OverlayWrapper({
  showX,
  removeOverlay,
  children
}) {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const closeUrl = `/icons/close.svg`;

  const closeStyle = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: isMobile ? isMobileXs ? "40px" : "60px" : "100px",
    right: isMobile ? isMobileXs ? "6px" : "15px" : "100px",
    zIndex: "20",
  };

  const clickerStyle = {
    flex: 1,
  };

  const middleColumn = {
    display: "flex",
    flexDirection: "column",
    overflow: isMobile && "auto",
  };

  const closeWrapperStyle = {
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  const closeInnerStyle = {
    height: isMobile ? "100%" : "calc(100% - 60px)",
    width: "100%",
    display: "flex",
    marginTop: isMobile ? "10px" : "60px",
  };

  return (
    <>
      <div style={closeWrapperStyle}>
        <div style={closeInnerStyle}>
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
          <div style={middleColumn}>
            <div
              style={clickerStyle}
              onClick={removeOverlay}
            />
            {children}
            <div
              style={clickerStyle}
              onClick={removeOverlay}
            />
          </div>
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
        </div>
      </div>
      {showX && (
        <img
          alt="close"
          src={closeUrl}
          style={closeStyle}
          onClick={removeOverlay}
        />
      )}
    </>
  );
}

export default OverlayWrapper;