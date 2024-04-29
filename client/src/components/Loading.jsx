import React from "react";

function Loading() {

  const styles = {
      position: "absolute",
      top: "70vh",
      objectFit: "cover"
  };

  return (
    <video style={styles} autoPlay loop muted playsInline>
      //TODO: safari version?
      // <source
      //   src={`/videos/loading.mp4`}
      //   type={'video/mp4; codecs="hvc1"'} />
      <source
        src={`/videos/loading.webm`}
        type={"video/webm"}/>
      </video>
  );
}

export default Loading;
