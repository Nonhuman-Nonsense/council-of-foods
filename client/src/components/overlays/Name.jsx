import { useState, useRef, useEffect } from "react";
import { capitalizeFirstLetter, useMobile } from "../../utils";
import { useTranslation } from "react-i18next";

function Name({ onContinueForward }) {

  const { t } = useTranslation();

  const wrapper = {
    maxWidth: "500px",
    display: "flex",
    flexDirection: "column"
  };

  return (
    <div style={wrapper}>
      <h1>{t('name.title')}</h1>
      <div>
        <p>{t('name.1')}</p>
        <p>{t('name.2')}<br />{t('name.21')}</p>
      </div>
      <HumanNameInput onContinueForward={onContinueForward} />
    </div>
  );
}

function HumanNameInput(props) {
  const [humanName, setHumanName] = useState("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState(false);
  const inputRef = useRef(null);
  const isMobile = useMobile();

  const { t } = useTranslation();

  const imageUrl = `/icons/send_message_filled.svg`;

  useEffect(() => {
    // Focus on the input field when the component mounts
    // Unle
    if (!isMobile) {
      inputRef.current.focus();
    }
  }, []);

  function handleChange(e) {
    const inputValue = e.target.value;
    const trimmedValue = inputValue.trim();

    setHumanName(inputValue);

    if (!trimmedValue) {
      setIsHumanNameMissing(true);
    } else {
      setIsHumanNameMissing(false);
      const capitalizedHumanName = capitalizeFirstLetter(trimmedValue);
      setHumanName(capitalizedHumanName);
    }
  }

  function continueForward() {
    if (humanName) {
      props.onContinueForward({ humanName: humanName });
    } else {
      setIsHumanNameMissing(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior of the Enter key

      continueForward();
    }
  }

  const inputStyle = {
    width: "300px",
    height: "22px",
    paddingRight: "30px"/* Make room for the arrow */
  };

  const imageStyle = {
    position: "absolute",
    right: "0",
    width: "23px",
    height: "23px",
    cursor: "pointer",
    marginRight: "6px",
    filter: "brightness(30%)",
  };

  const inputIconWrapper = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center"
  };

  return (
    <div>
      <h3>{t('name.3')}:</h3>
      <div style={inputIconWrapper}>
        {/* Adding an empty form, so that mobile keyboards will show the "go" button */}
        <form action="">
          <input
            ref={inputRef}
            style={inputStyle}
            type="text"
            value={humanName}
            placeholder={t('name.5')}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <input type="submit" style={{ position: "absolute", left: '-9999px' }} />
        </form>
        <img
          src={imageUrl}
          alt="continue"
          style={imageStyle}
          onClick={continueForward}
        />
      </div>
      <h3 style={{ visibility: !isHumanNameMissing ? "hidden" : "" }}>{t('name.4')}</h3>
    </div>
  );
}

export default Name;
