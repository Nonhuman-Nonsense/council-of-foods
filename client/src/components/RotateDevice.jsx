import Animation from "./Animation"

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
      <Animation src={'/animations/rotate.json'} style={styles} />
      <h3>rotate your device</h3>
    </div>);
}

export default RotateDevice;
