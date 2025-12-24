import { useState, useRef, useEffect } from "react";
import { capitalizeFirstLetter, useMobile } from "@/utils";
import { useTranslation } from "react-i18next";
import { Character } from "@shared/ModelTypes";

interface NameProps {
  participants: Character[];
  onContinueForward: (data: { humanName: string }) => void;
}

/**
 * Name Overlay
 * 
 * Allows a human participant to enter their name before joining the council.
 * 
 * Core Logic:
 * - Validates input to ensure name is not empty.
 * - Checks for duplicate names against existing `participants`.
 */
function Name({ participants, onContinueForward }: NameProps): React.ReactElement {

  const { t } = useTranslation();

  const wrapper: React.CSSProperties = {
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
      <HumanNameInput participants={participants} onContinueForward={onContinueForward} />
    </div>
  );
}

interface HumanNameInputProps {
  participants: Character[];
  onContinueForward: (data: { humanName: string }) => void;
}

/**
 * HumanNameInput Component
 * 
 * The actual input field logic for name entry.
 * Separated to manage its own focus and validation state.
 */
function HumanNameInput({ participants, onContinueForward }: HumanNameInputProps): React.ReactElement {
  const [humanName, setHumanName] = useState<string>("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState<boolean>(false);
  const [duplicateName, setDuplicateName] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMobile();

  const { t } = useTranslation();

  const imageUrl = `/icons/send_message_filled.svg`;

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    // Focus on the input field when the component mounts
    // Unle
    if (!isMobile && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobile]);

  /* -------------------------------------------------------------------------- */
  /*                                  Handlers                                  */
  /* -------------------------------------------------------------------------- */

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const inputValue = e.target.value;
    const trimmedValue = inputValue.trim();

    setHumanName(inputValue);

    if (isDuplicateName(inputValue)) {
      setDuplicateName(true);
    } else {
      setDuplicateName(false);
    }

    if (!trimmedValue) {
      setIsHumanNameMissing(true);
    } else {
      setIsHumanNameMissing(false);
      const capitalizedHumanName = capitalizeFirstLetter(trimmedValue);
      setHumanName(capitalizedHumanName);
    }
  }

  function continueForward(): void {

    if (humanName && !isDuplicateName(humanName)) {
      onContinueForward({ humanName: humanName });
    } else if (isDuplicateName(humanName)) {
      setDuplicateName(true);
    } else {
      setIsHumanNameMissing(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior of the Enter key

      continueForward();
    }
  }

  function isDuplicateName(check: string): boolean {
    let names = participants.map(p => p.name);
    //Because each value in the Set has to be unique, the value equality will be checked.
    names.push(check);
    return (new Set(names).size !== names.length);
  }

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  const inputStyle: React.CSSProperties = {
    width: "300px",
    height: "22px",
    paddingRight: "30px"/* Make room for the arrow */
  };

  const imageStyle: React.CSSProperties = {
    position: "absolute",
    right: "0",
    width: "23px",
    height: "23px",
    cursor: "pointer",
    marginRight: "6px",
    filter: "brightness(30%)",
  };

  const inputIconWrapper: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center"
  };

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

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
      <h3 style={{ visibility: (isHumanNameMissing || duplicateName) ? "visible" : "hidden" }}>
        {duplicateName ? t('name.unique') : t('name.4')}
      </h3>
    </div>
  );
}

export default Name;
