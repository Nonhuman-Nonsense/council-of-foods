import React from "react";
import Animation from "./Animation"

function Loading() {

  return (
    <div style={{position: "absolute", top: "73vh"}}>
      <Animation src={'/animations/loading.json'} style={{height: "150px"}} />
    </div>
  );
}

export default Loading;
