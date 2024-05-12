import React from "react";
function Welcome({ humanName, onContinueForward, isUnderneath }) {

  const wrapper = {
    maxWidth: "530px",
    visibility: isUnderneath && 'hidden'
  };
  return (
      <div style={wrapper}>
        <div>
          <h3>Dear {humanName},</h3>
          <p>
            Welcome to the Council of Foods! Here you can listen to foods discussing the broken food system, and even take part in the conversation. You will hear, from the foods themselves, what their eco-social influence and guiding ethical principles are and discuss together what actions need to be taken to form a locally and globally sustainable food system.
          </p>
          <p>
            Each food has a different background the mass produced, the locally grown, the genetically modified, the processed, the fair trade, the affordable and the biological. All the foods are assigned an AI language model, each prompted on different knowledges and ethical guidelines. Therefore, the members have divergent ethical positions and agendas, voicing a variety of perspectives in the Council of Foods.
          </p>
        </div>
        <br/>
        <button
          onClick={() => onContinueForward()}
        >
          Next
        </button>
      </div>
  );
}

export default Welcome;
