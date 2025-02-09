import { useMobile } from "../utils";

function OverlayWrapper({
  showX,
  removeOverlay,
  children
}) {
  const isMobile = useMobile();
  const closeUrl = `/icons/close.svg`;

  const closeStyle = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: isMobile ? "60px" : "100px",
    right: isMobile ? "15px" : "100px",
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
    height: "100vh",
    width: "100vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  const closeInnerStyle = {
    height: isMobile ? "calc(100% - 55px)" : "calc(100% - 60px)",
    width: "100%",
    display: "flex",
    marginTop: isMobile ? "55px" : "60px",
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