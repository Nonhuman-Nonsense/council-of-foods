import { useMobile, useMobileXs, usePortrait } from "../utils";

function OverlayWrapper({
  showX,
  removeOverlay,
  children
}) {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const isPortait = usePortrait();
  const closeUrl = `/icons/close.svg`;  

  const closeStyle = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: isPortait ? "20px" : isMobile ? isMobileXs ? "40px" : "60px" : "100px",
    right: isPortait ? "20px" : isMobile ? isMobileXs ? "6px" : "15px" : "100px",
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
    position: "absolute",
    height: (isMobile || isPortait) ? "100%" : "calc(100% - 60px)",
    width: "100%",
    display: "flex",
    marginTop: (isMobile || isPortait) ? "0" : "60px",
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