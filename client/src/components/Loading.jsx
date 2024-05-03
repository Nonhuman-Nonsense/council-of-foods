import React from "react";

function Loading() {

  const styles = {
      position: "absolute",
      top: "73vh",
      objectFit: "cover"
  };


  // TODO: safari version?
  // <source
  //   src={`/videos/loading.mp4`}
  //   type={'video/mp4; codecs="hvc1"'} />

  return (
    <video style={styles} autoPlay loop muted playsInline>
      <source
          src={`/videos/loading.webm`}
          type={"video/webm"} />
      </video>
  );
}

export default Loading;
