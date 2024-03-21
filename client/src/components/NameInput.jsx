import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

function NameInput() {
  return (
    <div>
      <h3 className="sub-sub-header">please type your name to enter:</h3>
      <div className="input-icon-wrapper">
        <input
          className="name-input"
          type="text"
          placeholder="your name"
        />
        <FontAwesomeIcon
          icon={faArrowRight}
          className="input-arrow"
        />
      </div>
    </div>
  );
}

export default NameInput;
