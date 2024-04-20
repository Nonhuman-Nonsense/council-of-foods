import React from "react";

function Contact() {
  return (
    <div className="wrapper">
      <div
        className="text-container"
        style={{ justifyContent: "center" }}
      >
        <h4>
          The project is an initiative by art & design
          <br /> collective Nonhuman Nonsense developed in
          <br /> collaboration with Studio Other Spaces,
          <br /> In4Art, Elliot, Albin and others.
        </h4>
        <h4>
          <a
            className="link"
            href="https://www.instagram.com/nonhuman-nonsense/"
          >
            @nonhuman-nonsense
          </a>
          <br />
          <a
            className="link"
            href="https://nonhuman-nonsense.com"
          >
            nonhuman-nonsense.com
          </a>
          <br />
          <a
            className="link"
            href="mailto:hello@nonhuman-nonsense.com"
          >
            hello@nonhuman-nonsense.com
          </a>
        </h4>
      </div>
    </div>
  );
}

export default Contact;
