function Overlay({ isActive, isBlurred, children }) {

  const overlayStyle = {
    position: "absolute",
    minHeight: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
    backgroundColor: isActive && "rgba(0, 0, 0, 0.5)",
    pointerEvents: isActive ? "auto" : "none",
  };

  return <div style={overlayStyle} className={isBlurred !== false && isActive === true ? "blur" : "blur hide"}>{children}</div>;
}

export default Overlay;
