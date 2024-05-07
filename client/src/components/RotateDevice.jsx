function RotateDevice(){

  const wrapper = {
    display: "flex",
    alignItems: "center",
    flexDirection: "column"
  };

  const styles = {
      width: "150px",
  };

  return (
    <div style={wrapper}>
      <video style={styles} autoPlay loop muted playsInline>
      <source
          src={`/videos/rotate.webm`}
          type={"video/webm"} />
      </video>
      <h3>rotate your device</h3>
    </div>);
}

export default RotateDevice;
