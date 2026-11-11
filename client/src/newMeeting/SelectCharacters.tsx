import { useState, useRef, useEffect, useMemo } from "react";
import { scrollFadeStyle, useScrollEdges } from "@/scrollEdges";
import type { AgendaPoint, Character } from "@shared/ModelTypes";
import { toTitleCase, useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import MediaPreloader from "@main/MediaPreloader";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";
import { characterIconWebpUrl } from "@assets/characters/characterData";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import {
  buildMeetingCharactersPayload,
  MAX_HUMAN_PANELISTS,
  orderSelectedCharactersForInstallation,
  selectedFoodNames,
  selectedPanelistNames,
  type CouncilRoster,
  type HumanDetails,
} from "./meetingSetup";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useCorner } from "@main/BottomBar";
import { getCharacterSetupBundle } from "./CharacterSetup";

import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";

export type { Character, CharacterSetupData } from "./CharacterSetup";
export { getCharacterSetupBundle, createDefaultHumans, createHuman, CHAIR_ID } from "./CharacterSetup";

export interface SelectCharactersProps {
  topicTitle: string;
  agendaPoints?: AgendaPoint[];
  onContinueForward: (data: { characters: Character[]; openingAgendaPoint?: string }) => void | Promise<void>;
  loading?: boolean;
  /**
   * Selection changes the visitor made by clicking, so the setup agent can
   * react to them. `selectedNames` is the resulting council (foods only, no
   * chair or human panelists). `isFull` reflects the total selection (chair,
   * foods, and human panelists together) against the same cap the UI enforces.
   * Only fired when the selection actually changed.
   */
  onCharacterSelected?: (selectedNames: string[], chairName: string, isFull: boolean) => void;
  onCharacterDeselected?: (selectedNames: string[], chairName: string, isFull: boolean) => void;
  onCharactersRandomized?: (selectedNames: string[], chairName: string, isFull: boolean) => void;
  /**
   * A human panelist joined the council — either a brand-new slot from the
   * "add human" button (blank name) or an existing panelist toggled back in
   * (named). The details let the message tell those apart without needing
   * separate events. Object form, matching the other human-panelist callbacks
   * below — unlike the character callbacks above, these need `panelistNames`
   * too, so the council roster the agent hears doesn't omit a panelist in the
   * same message that just told it one exists.
   */
  onHumanSelected?: (details: HumanDetails & CouncilRoster) => void;
  /**
   * The visitor is typing a panelist's name or description (debounced) or has
   * just left the field (a stronger "I'm done" signal, reacted to sooner).
   */
  onHumanDetailsTyped?: (details: HumanDetails & CouncilRoster) => void;
  onHumanDetailsConfirmed?: (details: HumanDetails & CouncilRoster) => void;
  /**
   * A panelist was taken out of the council. Their slot and details persist
   * (they can be toggled back in), so this is a deselection, not a delete.
   */
  onHumanDeselected?: (deselectedName: string, roster: CouncilRoster) => void;
}

function getCharacterImageUrl(id: string): string | undefined {
  return characterIconWebpUrl(id);
}


function isPanelistId(id: string): boolean {
  return id.startsWith("panelist");
}

function panelistIndexFromId(id: string): number | null {
  if (!isPanelistId(id)) return null;
  const match = id.match(/^panelist(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) ? index : null;
}

/** Space at each end of the character row, so the first and last icons sit off the screen edge. */
const ROW_GUTTER_PX = 12;
/** Fade at the row's edges where it scrolls on. */
const ROW_FADE_PX = 32;
/** Fade at the description's edges where it scrolls on. */
const DESCRIPTION_FADE_PX = 20;

/**
 * The shared participant-selection screen used before meeting creation.
 * Foods-specific asset and prompt sources stay named `foods`, while the
 * screen's own contract uses `characters` because Forest uses the same flow.
 */
function SelectCharacters({
  topicTitle,
  agendaPoints,
  onContinueForward,
  loading = false,
  onCharacterSelected,
  onCharacterDeselected,
  onCharactersRandomized,
  onHumanSelected,
  onHumanDetailsTyped,
  onHumanDetailsConfirmed,
  onHumanDeselected,
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
    audience,
  } = useMeetingSetupStore();
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const [humansReady, setHumansReady] = useState<boolean>(false);
  const [recheckHumansReady, setRecheckHumansReady] = useState<boolean>(false);

  const minCharacters = 2 + 1; // 2 plus chair
  const maxCharacters = 6 + 1; // 6 plus chair

  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const corner = useCorner();
  const rowScrollRef = useRef<HTMLDivElement>(null);
  const rowEdges = useScrollEdges(rowScrollRef, "x");
  const { capabilities } = useCouncilSettings();
  const { typedSetup } = capabilities;
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

  const chairName = useMemo(
    () => baseCharacters.find((character) => character.id === CHAIR_ID)?.name ?? "",
    [baseCharacters],
  );

  /**
   * The council as it stands right now, foods only. Reads the store directly
   * rather than the rendered `selectedCharacters`, because this runs in the
   * same tick as the mutation that changed it.
   */
  function currentSelectedFoodNames(): string[] {
    return selectedFoodNames(useMeetingSetupStore.getState().selectedCharacters, characters);
  }

  /**
   * Whether another member (food or human) could still be added. `maxCharacters`
   * caps the total selection, chair included, so this must read the same total
   * the UI itself gates on rather than food count alone — a council filled with
   * human panelists is just as full as one filled with foods.
   */
  function isCouncilFull(): boolean {
    return useMeetingSetupStore.getState().selectedCharacters.length >= maxCharacters;
  }

  /** Mirrors the per-panelist readiness check in the effect above (name
   *  always required, description required only where one can be typed). */
  function isHumanComplete(name: string, description: string): boolean {
    const needsDescription = typedSetup && description.length === 0;
    return name.length > 0 && !needsDescription;
  }

  /**
   * Named human panelists currently *selected* in the council. Same "read
   * fresh" reasoning as `currentSelectedFoodNames` — this runs right after
   * `setHumans`, so the component's own `humans` snapshot from the last
   * render would be stale.
   */
  function currentPanelistNames(): string[] {
    const store = useMeetingSetupStore.getState();
    return selectedPanelistNames(store.selectedCharacters, store.humans, store.numberOfHumans);
  }

  function buildHumanDetailsPayload(name: string, description: string): HumanDetails & CouncilRoster {
    return {
      humanName: name,
      humanDescription: description,
      isComplete: isHumanComplete(name, description),
      selectedNames: currentSelectedFoodNames(),
      chairName,
      isFull: isCouncilFull(),
      panelistNames: currentPanelistNames(),
    };
  }

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
        formatHumanCount: (count) => t("meeting.characters.humanCount", { count }),
      },
      agendaPoints,
      typedSetup,
      audience: audience ?? undefined,
    });
    if (built.ok) {
      onContinueForward({ characters: built.characters, openingAgendaPoint: built.openingAgendaPoint });
    }
  }

  function onAddHuman(): void {
    const idx = numberOfHumans;
    if (idx >= MAX_HUMAN_PANELISTS) return;
    if (!humans[idx]) return;
    setNumberOfHumans((prev) => Math.min(MAX_HUMAN_PANELISTS, prev + 1));
    // The reaction is reported by `selectCharacter` itself, which also covers
    // toggling an existing panelist back in — a path this button never takes,
    // since `idx` only ever advances to the next never-yet-used slot.
    selectCharacter(humans[idx]);
  }

  function selectCharacter(character: Character): void {
    const success = handleSelectCharacterId(character.id);
    // A rejected pick (council already full) changed nothing to react to.
    if (success) {
      setLastSelected(character.id);
      if (isPanelistId(character.id)) {
        // Covers both a fresh slot from the "add human" button (blank name)
        // and an existing panelist toggled back in (named) — the message
        // tells them apart from the details, so both share one path.
        onHumanSelected?.(buildHumanDetailsPayload(character.name, character.description));
      } else {
        onCharacterSelected?.(currentSelectedFoodNames(), chairName, isCouncilFull());
      }
    }
  }

  function deselectCharacter(character: Character): void {
    if (isPanelistId(character.id) && lastSelected !== character.id) {
      // Panelists take focus on first click; nothing is deselected yet.
      setLastSelected(character.id);
    } else {
      handleDeselectCharacterId(character.id);
      setLastSelected(null);
      if (!isPanelistId(character.id)) {
        onCharacterDeselected?.(currentSelectedFoodNames(), chairName, isCouncilFull());
      } else if (character.name.length > 0) {
        // An unnamed panelist toggled straight back out has nothing worth
        // reacting to — same as a click-in-click-out with no edit.
        onHumanDeselected?.(character.name, {
          selectedNames: currentSelectedFoodNames(),
          chairName,
          isFull: isCouncilFull(),
          panelistNames: currentPanelistNames(),
        });
      }
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
    onCharactersRandomized?.(currentSelectedFoodNames(), chairName, isCouncilFull());
  }

  useEffect(() => {
    const selectedHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));
    let ready = true;
    for (const humanId of selectedHumans) {
      const index = panelistIndexFromId(humanId);
      if (index !== null && humans[index]) {
        const needsDescription = typedSetup && humans[index].description.length === 0;
        if (humans[index].name.length === 0 || needsDescription) {
          ready = false;
        }
      }
    }
    setHumansReady(ready);
  }, [recheckHumansReady, selectedCharacters, humans, typedSetup]);

  useEffect(() => {
    if (typedSetup) return;
    if (!selectedCharacters.some(isPanelistId)) return;

    const sorted = orderSelectedCharactersForInstallation(selectedCharacters);
    if (sorted.join(",") !== selectedCharacters.join(",")) {
      setSelectedCharacters(sorted);
    }
  }, [typedSetup, selectedCharacters, setSelectedCharacters]);

  // Read fresh inside the cleanup below rather than closing over `humans`
  // directly — otherwise it could report whatever the panelist's details
  // were when editing *started*, not what they'd become by the time the
  // visitor moved on.
  const humansRef = useRef(humans);
  useEffect(() => {
    humansRef.current = humans;
  });

  // Distinguishes "moved away from this panelist" from "the whole step went
  // away". Declared *before* the effect below so React runs this cleanup
  // first on unmount, leaving the flag already false when that one checks it.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * "Confirmed" reaction: fires when the visitor moves away from a panelist
   * they were editing. Keyed on `lastSelected` rather than textarea blur —
   * `lastSelected` only changes on a real click, whereas blur also fires when
   * merely *hovering* a different card unmounts the active textarea (see
   * `infoToShow` below), which would otherwise misfire this on stray mouse
   * movement while the visitor is still mid-sentence.
   */
  useEffect(() => {
    const editingId = lastSelected;
    if (!editingId || !isPanelistId(editingId)) return;
    return () => {
      // Leaving the step entirely (starting the meeting, or going back to
      // topic selection) also runs this cleanup — but the visitor didn't
      // "finish describing" anything, and reacting then would have the agent
      // discussing panelists during the topic step.
      if (!isMountedRef.current) return;
      // The visitor may have deselected this panelist rather than just
      // clicked elsewhere — that has its own reaction, and a "finished
      // describing" message for someone no longer in the council would be
      // wrong. `handleDeselectCharacterId` is a synchronous store update, so
      // by the time this cleanup runs, a deselection already shows up here.
      if (!useMeetingSetupStore.getState().selectedCharacters.includes(editingId)) return;
      const index = panelistIndexFromId(editingId);
      if (index === null) return;
      const human = humansRef.current[index];
      if (!human) return;
      // Nothing was ever typed — a click-in-click-out with no edit isn't
      // worth reacting to.
      if (human.name.length === 0 && human.description.length === 0) return;
      onHumanDetailsConfirmed?.(buildHumanDetailsPayload(human.name, human.description));
    };
    // Deliberately keyed only on lastSelected; see comment above.
  }, [lastSelected]);

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
          onDetailsChanged={(name, description) =>
            onHumanDetailsTyped?.(buildHumanDetailsPayload(name, description))
          }
        />
      );
    } else {
      return (
        <div className="fadein">
          <p style={{ margin: 0 }}>{t("meeting.characters.meetingon")}</p>
          <h3>{topicTitle && toTitleCase(topicTitle)}</h3>
          <div>
            {!atLeastTwoCharacters() ? (
              <p>{t("meeting.characters.pleaseselect")}</p>
            ) : (
              <>
                <p>{t("meeting.characters.wewilllisten")}:</p>
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

  // Start, the hints and the spinner take turns in one slot under the characters.
  // The slot keeps one height and centres whichever is showing, with no margins of
  // their own, so swapping them never moves the row above.
  const infoSlotStyle: React.CSSProperties = {
    height: isMobile ? (isMobileXs ? "26px" : "32px") : "48px",
    marginTop: isMobileXs ? "2px" : "5px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const subInfoStyle: React.CSSProperties = { margin: 0 };

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
          style={{ margin: 0 }}
        >
          {t("app.start")}
        </button>
      );
    } else if (
      atLeastTwoCharacters() &&
      selectedCharacters.length <= maxCharacters &&
      !humansReady
    ) {
      return <h4 style={subInfoStyle}>{t("meeting.characters.requirename")}</h4>;
    } else if (
      atLeastTwoCharacters() &&
      selectedCharacters.length <= maxCharacters &&
      humansReady &&
      !ensureUniqueNames()
    ) {
      return <h4 style={subInfoStyle}>{t("meeting.characters.unique")}</h4>;
    } else if (
      hoveredCharacter !== null ||
      (selectedCharacters.length > 1 && !atLeastTwoCharacters())
    ) {
      return <h4 style={subInfoStyle}>{t("meeting.characters.pleaseselect")}</h4>;
    } else if (selectedCharacters.length < 2) {
      return (
        <button
          onClick={randomizeSelection}
          className="fadein"
          style={{ margin: 0, position: "absolute" }}
        >
          {t("meeting.characters.random")}
        </button>
      );
    }
    return null;
  }

  // A selection made out of sight (by the setup agent, or a half-hidden icon) is
  // scrolled fully into the row's view. Only the row scrolls: scrollIntoView would
  // also move the clipped frame around it.
  const lastSelectedId = selectedCharacters[selectedCharacters.length - 1];
  useEffect(() => {
    const scroller = rowScrollRef.current;
    if (!scroller || !lastSelectedId) return;
    const button = Array.from(scroller.querySelectorAll<HTMLElement>("[data-character-id]")).find(
      (el) => el.dataset.characterId === lastSelectedId,
    );
    if (!button) return;
    const box = scroller.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    const overLeft = item.left - (box.left + ROW_GUTTER_PX);
    const overRight = item.right - (box.right - ROW_GUTTER_PX);
    const by = overLeft < 0 ? overLeft : overRight > 0 ? overRight : 0;
    if (by !== 0) scroller.scrollBy?.({ left: by, behavior: "smooth" });
  }, [lastSelectedId]);

  // On a phone the page fills the frame, its characters and Start button down at
  // the bottom, clear only of what the setup agent's bottom bar shows under them:
  // the caption strip, or nothing on the smallest screens, where captions are hidden.
  // Elsewhere it is as tall as its content, centred in the frame.
  const frameStyle: React.CSSProperties = isMobile
    ? {
        alignSelf: "stretch",
        boxSizing: "border-box",
        paddingTop: isMobileXs ? "8px" : "24px",
        paddingBottom: isMobileXs ? `${corner.inset}px` : "45px",
      }
    : { marginBottom: "30px" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        ...frameStyle,
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h1 style={{ margin: isMobile ? "0" : undefined }}>{t("meeting.characters.title")}</h1>
        <div
          style={{
            position: "relative",
            // On a phone the panel takes whatever the frame leaves between the title
            // and the characters; elsewhere it has room for a fixed height.
            ...(isMobile
              ? { flex: "1 1 auto", minHeight: 0, marginBottom: "8px" }
              : { height: "380px" }),
            width: isMobile ? "587px" : "500px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {infoToShow()}
        </div>
      </div>
      <div style={{ alignSelf: "stretch" }}>
        {/* The row scrolls sideways when it is wider than the screen. Centred while it
            fits; once it doesn't, the auto margins collapse and it starts at the left,
            water first, running off the right edge, which fades where there is more. */}
        <div
          ref={rowScrollRef}
          className="scroll--hide-scrollbar"
          style={{
            overflowX: "auto",
            ...scrollFadeStyle("x", rowEdges, ROW_FADE_PX),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "max-content",
              margin: "0 auto",
              padding: `0 ${ROW_GUTTER_PX}px`,
            }}
          >
          {characters.map((character) => (
            <CharacterButton
              key={isPanelistId(character.id) ? character.id : character.name}
              character={character}
              onMouseEnter={() => setHoveredCharacter(character.id)}
              onMouseLeave={() => setHoveredCharacter(null)}
              onSelectCharacter={
                character.id === CHAIR_ID ? undefined : selectCharacter
              }
              onDeselectCharacter={deselectCharacter}
              isSelected={selectedCharacters.includes(character.id)}
              selectLimitReached={selectedCharacters.length >= maxCharacters}
            />
          ))}
          {typedSetup && numberOfHumans < MAX_HUMAN_PANELISTS && (
            <AddHumanButton
              onMouseEnter={() => setHoveredCharacter("addhuman")}
              onMouseLeave={() => setHoveredCharacter(null)}
              onAddHuman={onAddHuman}
              isSelected={selectedCharacters.includes("addhuman")}
              selectLimitReached={selectedCharacters.length >= maxCharacters}
            />
          )}
          </div>
        </div>
        {/* Rendered on installations too, empty: the page is centred, so the slot's
            space keeps it at the same height with or without on-screen buttons. */}
        <div style={infoSlotStyle}>{capabilities.browserUi ? buttonOrInfo() : null}</div>
      </div>
      <MediaPreloader
        foodIds={selectedCharacters.filter(
          (id) => !id.startsWith("panelist") && id !== "addhuman" && id !== ""
        )}
      />
    </div>
  );
}

interface CharacterDisplayData {
  name: string;
  description?: string;
}

interface CharacterInfoProps {
  character?: CharacterDisplayData;
}

function CharacterInfo({ character }: CharacterInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionEdges = useScrollEdges(descriptionRef, "y", character?.name);
  if (!character) return null;

  // The name stays put; a description longer than the panel scrolls under it,
  // fading at whichever edge has more.
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "opacity 0.5s ease",
        opacity: character !== null ? 1 : 0,
        pointerEvents: character !== null ? "all" : "none",
      }}
    >
      <h2 style={{ margin: isMobile ? "0" : "-15px 0 0 0" }}>{toTitleCase(character.name)}</h2>
      <p
        // Keyed on the character, so another one's description opens at the top.
        key={character.name}
        ref={descriptionRef}
        className="scroll"
        style={{
          margin: isMobile ? "0" : undefined,
          whiteSpace: "pre-wrap",
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          ...scrollFadeStyle("y", descriptionEdges, DESCRIPTION_FADE_PX),
        }}
      >
        {character.description?.split("\n").map((item, key) => {
          return (
            // Lines from a static string split, never reordered — index is a stable key.
            // eslint-disable-next-line @eslint-react/no-array-index-key
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
  human?: Character;
  setHumans: React.Dispatch<React.SetStateAction<Character[]>>;
  lastSelected?: string | null;
  unfocus?: boolean;
  setRecheckHumansReady: React.Dispatch<React.SetStateAction<boolean>>;
  /** Fired (debounced upstream) whenever the name or description changes. */
  onDetailsChanged?: (name: string, description: string) => void;
}

function HumanInfo({
  human,
  setHumans,
  lastSelected,
  unfocus,
  setRecheckHumansReady,
  onDetailsChanged,
}: HumanInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  const nameArea = useRef<HTMLTextAreaElement>(null);
  const descriptionArea = useRef<HTMLTextAreaElement>(null);

  const { t } = useTranslation();
  const humanIndex = human ? panelistIndexFromId(human.id) : null;

  useEffect(() => {
    if (!human || humanIndex === null) return;
    if (nameArea.current && descriptionArea.current) {
      nameArea.current.value = human.name;
      descriptionArea.current.value = human.description;
    }
  }, [human, humanIndex]);

  useEffect(() => {
    if (!human || humanIndex === null) return;
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
  }, [unfocus, lastSelected, human?.id, humanIndex]);

  if (!human || humanIndex === null) return null;

  function descriptionChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || humanIndex === null) return;
    const val = e.target.value;
    setHumans((prev) => {
      const next = [...prev];
      const old = next[humanIndex];
      if (!old) return prev;
      next[humanIndex] = { ...old, description: val };
      return next;
    });
    setRecheckHumansReady((prev) => !prev);
    onDetailsChanged?.(nameArea.current?.value ?? "", val);
  }

  function nameChanged(_e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || humanIndex === null) return;
    if (nameArea.current) {
      nameArea.current.value = toTitleCase(nameArea.current.value);
      const val = nameArea.current.value;
      setHumans((prev) => {
        const next = [...prev];
        const old = next[humanIndex];
        if (!old) return prev;
        next[humanIndex] = { ...old, name: val };
        return next;
      });
      setRecheckHumansReady((prev) => !prev);
      onDetailsChanged?.(val, descriptionArea.current?.value ?? "");
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
        placeholder={t("meeting.characters.humanname")}
        defaultValue={human.name}
      />
      <textarea
        ref={descriptionArea}
        style={descStyle}
        onChange={descriptionChanged}
        className="unfocused"
        maxLength={900}
        defaultValue={human.description}
        placeholder={t("meeting.characters.humandesc")}
      />
    </div>
  );
}

interface CharacterButtonProps {
  character: Character;
  onSelectCharacter?: (character: Character) => void;
  onDeselectCharacter?: (character: Character) => void;
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

  const imageId = isPanelistId(character.id) ? "panelist" : character.id;
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
      data-character-id={character.id}
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
