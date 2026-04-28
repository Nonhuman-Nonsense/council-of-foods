import { useState, useRef, useEffect, useMemo } from "react";
import { toTitleCase, useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { Character, VoiceOption, AVAILABLE_VOICES } from "@shared/ModelTypes";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import VideoPreloader from "@components/VideoPreloader";
import { globalClientOptions } from "@/globalClientOptions";

import Lottie from 'react-lottie-player';
import loadingAnimation from '@animations/loading.json';

// Dynamic import of food data modules
const foodModules = import.meta.glob<FoodData>('@shared/prompts/foods_*.json', { eager: true, import: 'default' });

// Eagerly import food images
const foodImages = import.meta.glob('/src/assets/foods/small/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

function getFoodImageUrl(id: string): string | undefined {
  // Construct the key that matches the glob pattern
  return foodImages[`/src/assets/foods/small/${id}.webp`];
}

export interface Food extends Partial<Character> {
  id: string;
  name: string;
  description: string;
  prompt?: string;
  type?: 'panelist' | 'food' | 'chair' | string;
  index?: number;
  voice: VoiceOption;
  voiceProvider?: 'openai' | 'gemini';
  voiceLocale?: string;
  size?: number;
  voiceInstruction?: string;
}

interface SelectFoodsProps {
  topicTitle: string;
  onContinueForward: (data: { foods: Food[] }) => void | Promise<void>;
  loading?: boolean;
  selectedFoods: string[];
  setSelectedFoods: React.Dispatch<React.SetStateAction<string[]>>;
  humans: Food[]; // fixed length (MAXHUMANS)
  setHumans: React.Dispatch<React.SetStateAction<Food[]>>;
  numberOfHumans: number;
  setNumberOfHumans: React.Dispatch<React.SetStateAction<number>>;
}

const MAXHUMANS = 3;

// Helper to access typed keys of foodData
// Assuming foodDataEN has a specific shape. Since it's JSON, TS infers it.
// We'll cast it to a known interface for safety.
interface FoodData {
  metadata: {
    version: string;
    last_updated: string;
  };
  panelWithHumans: string;
  addHuman: {
    id: string;
    name: string;
    description: string;
  };
  foods: Food[];
}

// We need to support dynamic language keys ideally, but code hardcodes 'en'.
// The foodData object in original code:
// const foodData = { "en": foodDataEN };
// We will type this.

const localFoodData: Record<string, FoodData> = {};

// We assume that the files exist, since we validate them in the tests
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = Object.keys(foodModules).find(path => path.endsWith(`foods_${lang}.json`));
  if (moduleKey) {
    localFoodData[lang] = foodModules[moduleKey];
  }
}

// Freeze original foodData to make it immutable
Object.freeze(localFoodData);
for (const language in localFoodData) {
  for (let i = 0; i < localFoodData[language].foods.length; i++) {
    Object.freeze(localFoodData[language].foods[i]);
  }
}

function requireFoodData(language: string): FoodData {
  // The app expects prompt bundles for all supported languages to exist at build time.
  // We still keep a hard runtime invariant so both TS and failures are crisp.
  const data = localFoodData[language] ?? localFoodData[AVAILABLE_LANGUAGES[0]];
  if (!data) {
    throw new Error(
      `Missing food prompt bundle. language=${language}, fallback=${AVAILABLE_LANGUAGES[0]}`
    );
  }
  return data;
}

/** Frozen foods + chair/system prompts for one UI language (wizard). */
export function getFoodsBundle(lang: string): FoodData {
  return requireFoodData(lang);
}

/** i18n fragments used when injecting human panelists into the chair prompt (same as Continue). */
export type MeetingFoodsI18n = {
  oneHuman: string;
  twoHumansSuffix: string;
};

/**
 * Validates foods-step state and builds the `Food[]` passed to `createMeeting` / `onContinueForward`,
 * including chair `[FOODS]` / `[HUMANS]` prompt injection. Shared by the Start button and voice `start_meeting`.
 */
export function buildMeetingFoodsPayload(params: {
  language: string;
  selectedFoods: string[];
  humans: Food[];
  numberOfHumans: number;
  labels: MeetingFoodsI18n;
}): { ok: true; foods: Food[] } | { ok: false; error: string } {
  const { language, selectedFoods, humans, numberOfHumans, labels } = params;
  const foodData = requireFoodData(language);
  const baseFoods = foodData.foods;
  const foods = [...baseFoods, ...humans.slice(0, numberOfHumans)];

  const minFoods = 2 + 1;
  const maxFoods = 6 + 1;

  if (selectedFoods.filter((id) => !id.startsWith("panelist")).length < minFoods) {
    return {
      ok: false,
      error:
        "Select at least two foods besides the chair (three non-human participants minimum), then try again.",
    };
  }
  if (selectedFoods.length > maxFoods) {
    return { ok: false, error: "Too many participants (at most six foods plus the chair)." };
  }

  const selectedHumans = selectedFoods.filter((id) => id.startsWith("panelist"));
  for (const humanId of selectedHumans) {
    const i = Number(humanId.slice(-1));
    const h = humans[i];
    if (h && (h.name.length === 0 || h.description.length === 0)) {
      return {
        ok: false,
        error: "Each human panelist needs a name and description before starting.",
      };
    }
  }

  const names = selectedFoods.map((id) => foods.find((f) => f.id === id)?.name);
  if (names.some((n) => n === undefined)) {
    return { ok: false, error: "Selection references an unknown participant." };
  }
  if (new Set(names).size !== names.length) {
    return { ok: false, error: "All participants must have unique names." };
  }

  const participatingFoods = selectedFoods.filter((id) => !id.startsWith("panelist"));
  const participatingHumans = selectedFoods.filter((id) => id.startsWith("panelist"));

  let participants = "";
  for (const [i, id] of participatingFoods.entries()) {
    const food = foods.find((f) => f.id === id);
    if (i !== 0 && food) participants += toTitleCase(food.name) + ", ";
  }
  if (participants.length > 2) {
    participants = participants.substring(0, participants.length - 2);
  }

  const replacedFoods: Food[] = [];
  for (const id of selectedFoods) {
    const found = foods.find((f) => f.id === id);
    if (found) replacedFoods.push(structuredClone(found));
  }

  if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
    replacedFoods[0].prompt =
      foodData.foods[0].prompt?.replace("[FOODS]", participants) || "";
  }

  let humanPresentation = "";
  if (participatingHumans.length > 0) {
    if (participatingHumans.length === 1) {
      humanPresentation += labels.oneHuman;
    } else {
      humanPresentation += participatingHumans.length + labels.twoHumansSuffix;
    }

    for (const id of participatingHumans) {
      const h = foods.find((f) => f.id === id);
      if (h) {
        humanPresentation += toTitleCase(h.name) + ", " + h.description + ". ";
      }
    }
    humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

    const humanPrompt = foodData.panelWithHumans;
    humanPresentation = humanPrompt.replace("[HUMANS]", humanPresentation);
  }

  if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
    replacedFoods[0].prompt = replacedFoods[0].prompt.replace("[HUMANS]", humanPresentation);
  }

  return { ok: true, foods: replacedFoods };
}

// Infer the default voice from the configuration to ensure blankHuman is valid
const defaultChair = localFoodData[AVAILABLE_LANGUAGES[0]]?.foods.find(f => f.id === globalClientOptions.chairId);
const defaultVoice: VoiceOption = defaultChair?.voice || AVAILABLE_VOICES[0];

const blankHuman: Food = {
  id: "", // Will be set
  type: "panelist",
  name: "",
  description: "",
  voice: defaultVoice,
  voiceProvider: defaultChair?.voiceProvider,
  voiceTemperature: defaultChair?.voiceTemperature,
  voiceInstruction: defaultChair?.voiceInstruction,
  voiceLocale: defaultChair?.voiceLocale,
  size: 1.0
};

export function createHuman(index: number): Food {
  // Uses chair voice by default so validation passes.
  const newHuman = structuredClone(blankHuman);
  newHuman.id = "panelist" + index;
  newHuman.index = index;
  return newHuman;
}

export function createDefaultHumans(): Food[] {
  return [createHuman(0), createHuman(1), createHuman(2)];
}

/**
 * SelectFoods Component
 * 
 * The main configuration screen where the user selects AI food participants and adds human panelists.
 */
function SelectFoods({
  topicTitle,
  onContinueForward,
  loading: loading = false,
  selectedFoods,
  setSelectedFoods,
  humans,
  setHumans,
  numberOfHumans,
  setNumberOfHumans,
}: SelectFoodsProps): React.ReactElement {
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const [humansReady, setHumansReady] = useState<boolean>(false);
  const [recheckHumansReady, setRecheckHumansReady] = useState<boolean>(false);
  const [currentFood, setCurrentFood] = useState<string | null>(null);

  const minFoods = 2 + 1; // 2 plus chair
  const maxFoods = 6 + 1; // 6 plus chair

  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t, i18n } = useTranslation();

  /* -------------------------------------------------------------------------- */
  /*                                   Helpers                                  */
  /* -------------------------------------------------------------------------- */

  const foodData = useMemo(() => {
    return requireFoodData(i18n.language);
  }, [i18n.language]);

  const baseFoods = useMemo(() => {
    return foodData.foods;
  }, [foodData]);

  const foods = useMemo(() => {
    const humanFoods = humans.slice(0, numberOfHumans);
    return [...baseFoods, ...humanFoods];
  }, [baseFoods, humans, numberOfHumans]);

  function atLeastTwoFoods(): boolean {
    return (selectedFoods.filter((id) => !id.startsWith('panelist')).length >= minFoods);
  }

  function ensureUniqueNames(): boolean {
    const names = selectedFoods.map(id => foods.find(f => f.id === id)?.name);
    //Because each value in the Set has to be unique, the value equality will be checked.
    // Check for undefined names just in case
    if (names.some(n => n === undefined)) return false;
    return (new Set(names).size === names.length);
  }

  /* -------------------------------------------------------------------------- */
  /*                                  Handlers                                  */
  /* -------------------------------------------------------------------------- */

  function continueForward(): void {
    if (loading) return;
    const built = buildMeetingFoodsPayload({
      language: i18n.language,
      selectedFoods,
      humans,
      numberOfHumans,
      labels: { oneHuman: t("selectfoods.human"), twoHumansSuffix: t("selectfoods.twohumans") },
    });
    if (built.ok) {
      onContinueForward({ foods: built.foods });
    }
  }

  function onAddHuman(): void {
    const idx = numberOfHumans;
    if (idx >= MAXHUMANS) return;
    if (!humans[idx]) return;
    setNumberOfHumans((prev) => Math.min(MAXHUMANS, prev + 1));
    selectFood(humans[idx]);
  }

  function selectFood(food: Food): void {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(food.id)) {
      setSelectedFoods((prevFoods) => [...prevFoods, food.id]);
      setLastSelected(food.id);
    }
  }

  function deselectFood(food: Food): void {
    //Human button is clicked that is already selected, but is not lastSelection, focus on it instead
    if (food.type === 'panelist' && lastSelected !== food.id) {
      setLastSelected(food.id);
    } else {
      //Normal deselection
      setSelectedFoods((prevFoods) => prevFoods.filter((f) => f !== food.id));
      setLastSelected(null);
    }
  }

  function randomizeSelection(): void {
    const amount = Math.floor(Math.random() * (maxFoods - minFoods + 1)) + minFoods - 1;
    const randomfoods = foods.slice(1).sort(() => 0.5 - Math.random()).slice(0, amount).map(f => f.id);
    setSelectedFoods([foods[0].id, ...randomfoods]);
  }

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const selectedHumans = selectedFoods.filter(id => id.startsWith('panelist'));
    let ready = true;
    for (const humanId of selectedHumans) {
      const i = Number(humanId.slice(-1)); // Assumes format "panelistX"
      // Validate index range
      if (humans[i]) {
        if (humans[i].name.length === 0 || humans[i].description.length === 0) {
          ready = false;
        }
      }
    }
    setHumansReady(ready);
  }, [recheckHumansReady, selectedFoods, humans]);

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  function infoToShow(): React.ReactNode {
    if (currentFood === 'addhuman') {
      return <FoodInfo food={foodData.addHuman} />;
    } else if (currentFood !== null && !currentFood.startsWith('panelist')) {//If something is hovered & if it's not a human
      return <FoodInfo food={foods.find(f => f.id === currentFood)} />;
    } else if (currentFood?.startsWith('panelist') && lastSelected !== currentFood) {//a human is hovered but not selected
      return <HumanInfo human={humans.find(h => h.id === currentFood)} unfocus={true} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    } else if (lastSelected?.startsWith('panelist')) {//a human is selected
      return <HumanInfo human={humans.find(h => h.id === lastSelected)} lastSelected={lastSelected} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    } else {
      return (
      <div className="fadein">
        <p style={{ margin: 0 }}>{t('selectfoods.meetingon')}</p>
        <h3>{topicTitle && toTitleCase(topicTitle)}</h3>
        <div>
          {!atLeastTwoFoods() ? <p>{t('selectfoods.pleaseselect')}</p> : <><p>{t('selectfoods.wewilllisten')}:</p>
            <div>{selectedFoods.map((id) => {
              const f = foods.find(f => f.id === id);
              return <p style={{ margin: 0 }} key={id.startsWith('panelist') ? id : f?.name}>{f?.name}</p>
            })}</div>
          </>}
        </div>
      </div>
      );
    }
    return null;
  }

  const subInfoStyle: React.CSSProperties = {
    margin: isMobile ? (isMobileXs ? "0" : "7px") : undefined
  };

  function buttonOrInfo(): React.ReactElement | null {
    if (loading) {
      return <div>
        <Lottie play loop animationData={loadingAnimation} style={{ height: isMobile ? "40px" : "60px" }} />
      </div>
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && ensureUniqueNames()) {
      return (
        <button
          type="button"
          disabled={loading}
          onClick={continueForward}
          style={{ margin: isMobileXs ? "0" : "8px 0" }}
        >
          {t('start')}
        </button>
      );
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && !humansReady) {
      return <h4 style={subInfoStyle}>{t('selectfoods.requirename')}</h4>;
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && !ensureUniqueNames()) {
      return <h4 style={subInfoStyle}>{t('selectfoods.unique')}</h4>;
    } else if (currentFood !== null || (selectedFoods.length > 1 && !atLeastTwoFoods())) {
      return <h4 style={subInfoStyle}>{t('selectfoods.pleaseselect')}</h4>;
    } else if (selectedFoods.length < 2) {
      return <button onClick={randomizeSelection} className="fadein" style={{ margin: isMobileXs ? "0" : "8px 0", position: "absolute" }}>{t('selectfoods.random')}</button>;
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
        alignItems: "center"
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h1 style={{ margin: isMobile ? "0" : undefined }}>{t('selectfoods.title')}</h1>
        <div
          style={{
            position: "relative",
            height: isMobile ? (isMobileXs ? "190px" : "240px") : "380px",
            width: isMobile ? "587px" : "500px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          {infoToShow()}
        </div>
      </div>
      <div style={{ height: isMobile ? "93px" : "110px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {foods.map((food) => (
            <FoodButton
              key={food.type === 'panelist' ? food.id : food.name}
              food={food}
              onMouseEnter={() => setCurrentFood(food.id)}
              onMouseLeave={() => setCurrentFood(null)}
              // moderator check
              onSelectFood={food.id === globalClientOptions.chairId ? undefined : selectFood}
              onDeselectFood={deselectFood}
              isSelected={selectedFoods.includes(food.id)}
              selectLimitReached={selectedFoods.length >= maxFoods}
            />
          ))}
          {(numberOfHumans < MAXHUMANS) && <AddHumanButton
            onMouseEnter={() => setCurrentFood('addhuman')}
            onMouseLeave={() => setCurrentFood(null)}
            onAddHuman={onAddHuman}
            isSelected={selectedFoods.includes('addhuman')}
            selectLimitReached={selectedFoods.length >= maxFoods}
          />}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px" }}>
          {buttonOrInfo()}
        </div>
      </div>
      <VideoPreloader foodIds={selectedFoods.filter(id => !id.startsWith('panelist') && id !== 'addhuman' && id !== '')} />
    </div>
  );
}

/**
 * Display food character info when hovered/selected
 */
interface FoodDisplayData {
  name: string;
  description: string;
}

interface FoodInfoProps {
  food?: FoodDisplayData;
}

function FoodInfo({ food }: FoodInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  if (!food) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        transition: "opacity 0.5s ease",
        opacity: food !== null ? 1 : 0,
        pointerEvents: food !== null ? "all" : "none",
      }}
    >
      <h2 style={{ margin: isMobile ? "0" : "-15px 0 0 0" }}>{toTitleCase(food.name)}</h2>
      <p style={{ margin: isMobile ? "0" : undefined, whiteSpace: "pre-wrap" }}>{food.description?.split('\n').map((item, key) => {
        return <span key={key}>{item}<br /></span>
      })}
      </p>
    </div>
  );
}

/**
 * Editable form for human panelists
 */
interface HumanInfoProps {
  human?: Food;
  setHumans: React.Dispatch<React.SetStateAction<Food[]>>;
  lastSelected?: string | null;
  unfocus?: boolean;
  setRecheckHumansReady: React.Dispatch<React.SetStateAction<boolean>>;
}

function HumanInfo({ human, setHumans, lastSelected, unfocus, setRecheckHumansReady }: HumanInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  const nameArea = useRef<HTMLTextAreaElement>(null);
  const descriptionArea = useRef<HTMLTextAreaElement>(null);

  const { t } = useTranslation();

  // Effect to update values when human data changes (e.g. from parent re-render or switching humans)
  useEffect(() => {
    if (!human || human.index === undefined) return;
    if (nameArea.current && descriptionArea.current) {
      nameArea.current.value = human.name;
      descriptionArea.current.value = human.description;
    }
  }, [human]);

  // Effect to handle focus ONLY when selection changes or unfocus trigger changes
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
    setRecheckHumansReady(prev => !prev);
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
      setRecheckHumansReady(prev => !prev);
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
    // marginBottom: isMobile && "-8px",
    lineHeight: "1em",
    resize: "none",
    padding: "0",
  };

  const nameStyle: React.CSSProperties = {
    ...textStyle,
    margin: isMobile ? "0" : "-12px 0 0 0",
    fontSize: "39px",
    height: "45px"
  };

  const descStyle: React.CSSProperties = {
    ...textStyle,
    lineHeight: "21px",
    margin: "6px 0 0 0",
    height: "330px"
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
        placeholder={t('selectfoods.humanname')}
        defaultValue={human.name}
      />
      <textarea
        ref={descriptionArea}
        style={descStyle}
        onChange={descriptionChanged}
        className="unfocused"
        maxLength={900}
        defaultValue={human.description}
        placeholder={t('selectfoods.humandesc')}
      />
    </div>
  );
}

interface FoodButtonProps {
  food: Food;
  onSelectFood?: (food: Food) => void;
  onDeselectFood?: (food: Food) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isSelected: boolean;
  selectLimitReached: boolean;
}

function FoodButton({
  food,
  onSelectFood,
  onDeselectFood,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}: FoodButtonProps): React.ReactElement {
  const isMobile = useMobile();
  const isModerator = onSelectFood === undefined;

  // Resolve image from imported assets
  const imageId = food.type === 'panelist' ? 'panelist' : food.id;
  const imageUrl = getFoodImageUrl(imageId);

  function handleClickFood() {
    if (!isModerator && (!selectLimitReached || isSelected)) {
      if (!isSelected) {
        onSelectFood?.(food);
      } else {
        onDeselectFood?.(food);
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
    backgroundColor: (isSelected ? "rgba(0,0,0,0.7)" : "transparent"),
    cursor:
      isModerator || (selectLimitReached && !isSelected)
        ? "default"
        : "pointer",
    border: isModerator
      ? "4px solid white"
      : isSelected
        ? "2px solid white"
        : selectLimitReached
          ? "2px solid rgb(255,255,255,0.5)"
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
      onClick={handleClickFood}
    >
      <img
        src={imageUrl}
        alt={food.name}
        style={imageStyle}
      />
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
  const imageUrl = getFoodImageUrl('add');

  function handleAddHuman() {
    if ((!selectLimitReached)) {
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
    backgroundColor: (isSelected ? "rgba(0,0,0,0.7)" : "transparent"),
    cursor:
      (selectLimitReached && !isSelected)
        ? "default"
        : "pointer",
    border: isSelected
      ? "2px solid white"
      : selectLimitReached
        ? "2px solid rgb(255,255,255,0.5)"
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
      <img
        src={imageUrl}
        alt={'add human'}
        style={imageStyle}
      />
    </div>
  );
}

export default SelectFoods;
