import React from "react";
function Welcome({ humanName, onContinueForward }) {
  return (
    <div className="wrapper">
      <div className="text-container">
        <div>
          <h4>Dear {humanName},</h4>
          <br />
          <h4>
            Welcome to the Council of Foods! Here you can listen to foods
            <br /> discussing the broken food system, and even take part in the
            <br /> conversation. You will hear, from the foods themselves, what
            <br /> their eco-social influence and guiding ethical principles are
            and
            <br /> discuss together what actions need to be taken to form a
            locally
            <br /> and globally sustainable food system.
          </h4>
          <h4>
            Each food has a different background the mass produced, the
            <br /> locally grown, the genetically modified, the processed, the
            fair
            <br /> trade, the affordable and the biological. All the foods are
            <br /> assigned an AI language model, each prompted on different
            <br /> knowledges and ethical guidelines. Therefore, the members
            have
            <br /> divergent ethical positions and agendas, voicing a variety of
            <br /> perspectives in the Council of Foods.
          </h4>
        </div>
        <button
          className="outline-button"
          onClick={() => onContinueForward()}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Welcome;
