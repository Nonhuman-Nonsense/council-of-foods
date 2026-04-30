import { useState, useRef, useEffect, useMemo } from "react";
import { toTitleCase, useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import VideoPreloader from "@main/VideoPreloader";
import { globalClientOptions } from "@/globalClientOptions";
import { characterIconWebpUrl } from "@assets/characters/characterData";
import { useMeetingSetupStore } from "@stores/useMeetingSetupStore";
import { buildMeetingCharactersPayload } from "./meetingSetup";
import type { MeetingCharacter, CharacterSetupData } from "./CharacterSetup";
import { getCharacterSetupBundle, createDefaultHumans, createHuman } from "./CharacterSetup";

import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";

export type { MeetingCharacter, CharacterSetupData } from "./CharacterSetup";
export { getCharacterSetupBundle, createDefaultHumans, createHuman } from "./CharacterSetup";

export interface SelectCharactersProps {
  topicTitle: string;
  onContinueForward: (data: { characters: MeetingCharacter[] }) => void | Promise<void>;
  loading?: boolean;
}

function getCharacterImageUrl(id: string): string | undefined {
  return characterIconWebpUrl(id);
}

const MAXHUMANS = 3;

/**
 * The shared participant-selection screen used before meeting creation.
 * Foods-specific asset and prompt sources stay named `foods`, while the
 * screen's own contract uses `characters` because Forest uses the same flow.
 */
function SelectCharacters({
  topicTitle,
  onContinueForward,
  loading = false,
}: SelectCharactersProps): React.ReactElement {
  const {
    selectedCharacters,
    setSelectedCharacters,
    handleSelectCharacterId,
    handleDeselectCharacterId,
    humans,
    setHumans,
    numberOfHumans,
    setNumberOfHumans,
    hoveredCharacter,
    setHoveredCharacter,
  } = useMeetingSetupStore();
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const [humansReady, setHumansReady] = useState<boolean>(false);
  const [recheckHumansReady, setRecheckHumansReady] = useState<boolean>(false);

  const minCharacters = 2 + 1; // 2 plus chair
  const maxCharacters = 6 + 1; // 6 plus chair

  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t, i18n } = useTranslation();

  const characterSetupData = useMemo(() => {
    return getCharacterSetupBundle(i18n.language);
  }, [i18n.language]);

  const baseCharacters = useMemo(() => {
    return characterSetupData.characters;
  }, [characterSetupData]);

  const characters = useMemo(() => {
    const humanCharacters = humans.slice(0, numberOfHumans);
    return [...baseCharacters, ...humanCharacters];
  }, [baseCharacters, humans, numberOfHumans]);

  function atLeastTwoCharacters(): boolean {
    return selectedCharacters.filter((id) => !id.startsWith("panelist")).length >= minCharacters;
  }

  function ensureUniqueNames(): boolean {
    const names = selectedCharacters.map((id) => characters.find((character) => character.id === id)?.name);
    if (names.some((name) => name === undefined)) return false;
    return new Set(names).size === names.length;
  }

  function continueForward(): void {
    if (loading) return;
    const built = buildMeetingCharactersPayload({
      language: i18n.language,
      selectedCharacters,
      humans,
      numberOfHumans,
      labels: {
        oneHuman: t("selectfoods.human"),
        twoHumansSuffix: t("selectfoods.twohumans"),
      },
    });
    if (built.ok) {
      onContinueForward({ characters: built.characters });
    }
  }

  function onAddHuman(): void {
    const idx = numberOfHumans;
    if (idx >= MAXHUMANS) return;
    if (!humans[idx]) return;
    setNumberOfHumans((prev) => Math.min(MAXHUMANS, prev + 1));
    selectCharacter(humans[idx]);
  }

  function selectCharacter(character: MeetingCharacter): void {
    const success = handleSelectCharacterId(character.id);
    if (success) {
      setLastSelected(character.id);
    }
  }

  function deselectCharacter(character: MeetingCharacter): void {
    if (character.type === "panelist" && lastSelected !== character.id) {
      setLastSelected(character.id);
    } else {
      handleDeselectCharacterId(character.id);
      setLastSelected(null);
    }
  }

  function randomizeSelection(): void {
    const amount =
      Math.floor(Math.random() * (maxCharacters - minCharacters + 1)) + minCharacters - 1;
    const randomCharacters = characters
      .slice(1)
      .sort(() => 0.5 - Math.random())
      .slice(0, amount)
      .map((character) => character.id);
    setSelectedCharacters([characters[0].id, ...randomCharacters]);
  }

  useEffect(() => {
    const selectedHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));
    let ready = true;
    for (const humanId of selectedHumans) {
      const index = Number(humanId.slice(-1));
      if (humans[index]) {
        if (humans[index].name.length === 0 || humans[index].description.length === 0) {
          ready = false;
        }
      }
    }
    setHumansReady(ready);
  }, [recheckHumansReady, selectedCharacters, humans]);

  function infoToShow(): React.ReactNode {
    if (hoveredCharacter === "addhuman") {
      return <CharacterInfo character={characterSetupData.addHuman} />;
    } else if (
      hoveredCharacter !== null &&
      !hoveredCharacter.startsWith("panelist")
    ) {
      return <CharacterInfo character={characters.find((item) => item.id === hoveredCharacter)} />;
    } else if (
      hoveredCharacter?.startsWith("panelist") &&
      lastSelected !== hoveredCharacter
    ) {
      return (
        <HumanInfo
          human={humans.find((human) => human.id === hoveredCharacter)}
          unfocus={true}
          setHumans={setHumans}
          setRecheckHumansReady={setRecheckHumansReady}
        />
      );
    } else if (lastSelected?.startsWith("panelist")) {
      return (
        <HumanInfo
          human={humans.find((human) => human.id === lastSelected)}
          lastSelected={lastSelected}
          setHumans={setHumans}
          setRecheckHumansReady={setRecheckHumansReady}
        />
      );
    } else {
      return (
        <div className="fadein">
          <p style={{ margin: 0 }}>{t("selectfoods.meetingon")}</p>
          <h3>{topicTitle && toTitleCase(topicTitle)}</h3>
          <div>
            {!atLeastTwoCharacters() ? (
              <p>{t("selectfoods.pleaseselect")}</p>
            ) : (
              <>
                <p>{t("selectfoods.wewilllisten")}:</p>
                <div>
                  {selectedCharacters.map((id) => {
                    const character = characters.find((item) => item.id === id);
                    return (
                      <p
                        style={{ margin: 0 }}
                        key={id.startsWith("panelist") ? id : character?.name}
                      >
                        {character?.name}
                      </p>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      );
    }
  }

  const subInfoStyle: React.CSSProperties = {
    margin: isMobile ? (isMobileXs ? "0" : "7px") : undefined,
  };

  function buttonOrInfo(): React.ReactElement | null {
    if (loading) {
      return (
        <div>
          <Lottie
            play
            loop
            animationData={loadingAnimation}
            style={{ height: isMobile ? "40px" : "60px" }}
          />
        </div>
      );
    } else if (
      atLeastTwoCharacters() &&
      selectedCharacters.length <= maxCharacters &&
      humansReady &&
      ensureUniqueNames()
    ) {
      return (
        <button
          type="button"
          disabled={loading}
          onClick={continueForward}
          style={{ margin: isMobileXs ? "0" : "8px 0" }}
        >
          {t("start")}
        </button>
      );
    } else if (
      atLeastTwoCharacters() &&
      selectedCharacters.length <= maxCharacters &&
      !humansReady
    ) {
      return <h4 style={subInfoStyle}>{t("selectfoods.requirename")}</h4>;
    } else if (
      atLeastTwoCharacters() &&
      selectedCharacters.length <= maxCharacters &&
      humansReady &&
      !ensureUniqueNames()
    ) {
      return <h4 style={subInfoStyle}>{t("selectfoods.unique")}</h4>;
    } else if (
      hoveredCharacter !== null ||
      (selectedCharacters.length > 1 && !atLeastTwoCharacters())
    ) {
      return <h4 style={subInfoStyle}>{t("selectfoods.pleaseselect")}</h4>;
    } else if (selectedCharacters.length < 2) {
      return (
        <button
          onClick={randomizeSelection}
          className="fadein"
          style={{ margin: isMobileXs ? "0" : "8px 0", position: "absolute" }}
        >
          {t("selectfoods.random")}
        </button>
      );
    }
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "75%",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h1 style={{ margin: isMobile ? "0" : undefined }}>{t("selectfoods.title")}</h1>
        <div
          style={{
            position: "relative",
            height: isMobile ? (isMobileXs ? "190px" : "240px") : "380px",
            width: isMobile ? "587px" : "500px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {infoToShow()}
        </div>
      </div>
      <div style={{ height: isMobile ? "93px" : "110px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {characters.map((character) => (
            <CharacterButton
              key={character.type === "panelist" ? character.id : character.name}
              character={character}
              onMouseEnter={() => setHoveredCharacter(character.id)}
              onMouseLeave={() => setHoveredCharacter(null)}
              onSelectCharacter={
                character.id === globalClientOptions.chairId ? undefined : selectCharacter
              }
              onDeselectCharacter={deselectCharacter}
              isSelected={selectedCharacters.includes(character.id)}
              selectLimitReached={selectedCharacters.length >= maxCharacters}
            />
          ))}
          {numberOfHumans < MAXHUMANS && (
            <AddHumanButton
              onMouseEnter={() => setHoveredCharacter("addhuman")}
              onMouseLeave={() => setHoveredCharacter(null)}
              onAddHuman={onAddHuman}
              isSelected={selectedCharacters.includes("addhuman")}
              selectLimitReached={selectedCharacters.length >= maxCharacters}
            />
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px" }}>
          {buttonOrInfo()}
        </div>
      </div>
      <VideoPreloader
        foodIds={selectedCharacters.filter(
          (id) => !id.startsWith("panelist") && id !== "addhuman" && id !== ""
        )}
      />
    </div>
  );
}

interface CharacterDisplayData {
  name: string;
  description: string;
}

interface CharacterInfoProps {
  character?: CharacterDisplayData;
}

function CharacterInfo({ character }: CharacterInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  if (!character) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        transition: "opacity 0.5s ease",
        opacity: character !== null ? 1 : 0,
        pointerEvents: character !== null ? "all" : "none",
      }}
    >
      <h2 style={{ margin: isMobile ? "0" : "-15px 0 0 0" }}>{toTitleCase(character.name)}</h2>
      <p style={{ margin: isMobile ? "0" : undefined, whiteSpace: "pre-wrap" }}>
        {character.description?.split("\n").map((item, key) => {
          return (
            <span key={key}>
              {item}
              <br />
            </span>
          );
        })}
      </p>
    </div>
  );
}

interface HumanInfoProps {
  human?: MeetingCharacter;
  setHumans: React.Dispatch<React.SetStateAction<MeetingCharacter[]>>;
  lastSelected?: string | null;
  unfocus?: boolean;
  setRecheckHumansReady: React.Dispatch<React.SetStateAction<boolean>>;
}

function HumanInfo({
  human,
  setHumans,
  lastSelected,
  unfocus,
  setRecheckHumansReady,
}: HumanInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  const nameArea = useRef<HTMLTextAreaElement>(null);
  const descriptionArea = useRef<HTMLTextAreaElement>(null);

  const { t } = useTranslation();

  useEffect(() => {
    if (!human || human.index === undefined) return;
    if (nameArea.current && descriptionArea.current) {
      nameArea.current.value = human.name;
      descriptionArea.current.value = human.description;
    }
  }, [human]);

  useEffect(() => {
    if (!human || human.index === undefined) return;
    if (nameArea.current && descriptionArea.current) {
      if (lastSelected === human.id && unfocus !== true) {
        nameArea.current.focus();
        const length = nameArea.current.value.length;
        nameArea.current.setSelectionRange(length, length);
      } else if (unfocus === true) {
        nameArea.current.blur();
        descriptionArea.current.blur();
      }
    }
  }, [unfocus, lastSelected, human?.id]);

  if (!human || human.index === undefined) return null;

  function descriptionChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || human.index === undefined) return;
    const val = e.target.value;
    setHumans((prev) => {
      const next = [...prev];
      const old = next[human.index!];
      if (!old) return prev;
      next[human.index!] = { ...old, description: val };
      return next;
    });
    setRecheckHumansReady((prev) => !prev);
  }

  function nameChanged(_e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || human.index === undefined) return;
    if (nameArea.current) {
      nameArea.current.value = toTitleCase(nameArea.current.value);
      const val = nameArea.current.value;
      setHumans((prev) => {
        const next = [...prev];
        const old = next[human.index!];
        if (!old) return prev;
        next[human.index!] = { ...old, name: val };
        return next;
      });
      setRecheckHumansReady((prev) => !prev);
    }
  }

  const textStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    width: "100%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "'Tinos', sans-serif",
    fontSize: isMobile ? "15px" : "18px",
    margin: isMobile ? "0" : undefined,
    lineHeight: "1em",
    resize: "none",
    padding: "0",
  };

  const nameStyle: React.CSSProperties = {
    ...textStyle,
    margin: isMobile ? "0" : "-12px 0 0 0",
    fontSize: "39px",
    height: "45px",
  };

  const descStyle: React.CSSProperties = {
    ...textStyle,
    lineHeight: "21px",
    margin: "6px 0 0 0",
    height: "330px",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        width: "100%",
        transition: "opacity 0.5s ease",
        opacity: human !== null ? 1 : 0,
        pointerEvents: human !== null ? "all" : "none",
      }}
    >
      <textarea
        ref={nameArea}
        style={nameStyle}
        onChange={nameChanged}
        className="unfocused"
        maxLength={25}
        placeholder={t("selectfoods.humanname")}
        defaultValue={human.name}
      />
      <textarea
        ref={descriptionArea}
        style={descStyle}
        onChange={descriptionChanged}
        className="unfocused"
        maxLength={900}
        defaultValue={human.description}
        placeholder={t("selectfoods.humandesc")}
      />
    </div>
  );
}

interface CharacterButtonProps {
  character: MeetingCharacter;
  onSelectCharacter?: (character: MeetingCharacter) => void;
  onDeselectCharacter?: (character: MeetingCharacter) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isSelected: boolean;
  selectLimitReached: boolean;
}

function CharacterButton({
  character,
  onSelectCharacter,
  onDeselectCharacter,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}: CharacterButtonProps): React.ReactElement {
  const isMobile = useMobile();
  const isModerator = onSelectCharacter === undefined;

  const imageId = character.type === "panelist" ? "panelist" : character.id;
  const imageUrl = getCharacterImageUrl(imageId);

  function handleClickCharacter() {
    if (!isModerator && (!selectLimitReached || isSelected)) {
      if (!isSelected) {
        onSelectCharacter?.(character);
      } else {
        onDeselectCharacter?.(character);
      }
    }
  }

  const buttonStyle: React.CSSProperties = {
    marginLeft: "4px",
    marginRight: "4px",
    width: isMobile ? "42px" : "56px",
    height: isMobile ? "42px" : "56px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: isSelected ? "rgba(0,0,0,0.7)" : "transparent",
    cursor: isModerator || (selectLimitReached && !isSelected) ? "default" : "pointer",
    border: isModerator
      ? "4px solid white"
      : isSelected
        ? "2px solid white"
        : "2px solid rgb(255,255,255,0.5)",
  };

  const imageStyle: React.CSSProperties = {
    width: "80%",
    height: "80%",
    objectFit: "cover",
    borderRadius: "50%",
  };

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={buttonStyle}
      onClick={handleClickCharacter}
    >
      <img src={imageUrl} alt={character.name} style={imageStyle} />
    </div>
  );
}

interface AddHumanButtonProps {
  onAddHuman: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isSelected?: boolean;
  selectLimitReached: boolean;
}

function AddHumanButton({
  onAddHuman,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}: AddHumanButtonProps): React.ReactElement {
  const isMobile = useMobile();
  const imageUrl = getCharacterImageUrl("add");

  function handleAddHuman() {
    if (!selectLimitReached) {
      onAddHuman();
    }
  }

  const buttonStyle: React.CSSProperties = {
    marginLeft: "4px",
    marginRight: "4px",
    width: isMobile ? "42px" : "56px",
    height: isMobile ? "42px" : "56px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: isSelected ? "rgba(0,0,0,0.7)" : "transparent",
    cursor: selectLimitReached && !isSelected ? "default" : "pointer",
    border: isSelected
      ? "2px solid white"
      : "2px solid rgb(255,255,255,0.5)",
  };

  const imageStyle: React.CSSProperties = {
    width: "80%",
    height: "80%",
    objectFit: "cover",
    borderRadius: "50%",
  };

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={buttonStyle}
      onClick={handleAddHuman}
    >
      <img src={imageUrl} alt={"add human"} style={imageStyle} />
    </div>
  );
}

export default SelectCharacters;
