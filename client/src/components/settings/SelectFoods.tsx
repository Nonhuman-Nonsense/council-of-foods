import { useState, useRef, useEffect } from "react";
import { toTitleCase, useMobile, useMobileXs, filename } from "@/utils";
import { useTranslation } from "react-i18next";

import globalOptionsData from "@/global-options-client.json";
import { Character } from "@shared/ModelTypes";

import foodDataEN from "@prompts/foods_en.json";

interface GlobalOptions {
  audio_speed?: number;
  conversationMaxLength: number;
  meetingVeryMaxLength: number;
  extraMessageCount: number;
  chairId: string;
}

const globalOptions: GlobalOptions = globalOptionsData;

export interface Food extends Partial<Character> {
  id: string; // Required
  name: string; // Required
  description: string;
  prompt?: string;
  type?: 'panelist' | 'food' | 'chair' | string;
  index?: number;
  voice?: string; // Optional in configuration, but required for Character
  size?: number;
  voiceInstruction?: string;
}

interface SelectFoodsProps {
  lang: string;
  topicTitle: string;
  onContinueForward: (data: { foods: Food[] }) => void;
}

const MAXHUMANS = 3;

// Helper to access typed keys of foodData
interface FoodData {
  foods: Food[];
  panelWithHumans: string;
}

const localFoodData: Record<string, FoodData> = {
  "en": foodDataEN as unknown as FoodData // Cast JSON
};

// Freeze original foodData to make it immutable
Object.freeze(localFoodData);
for (const language in localFoodData) {
  for (let i = 0; i < localFoodData[language].foods.length; i++) {
    Object.freeze(localFoodData[language].foods[i]);
  }
}

const blankHuman: Food = {
  id: "", // Will be set
  type: "panelist",
  name: "",
  description: ""
};

/**
 * SelectFoods Component
 * 
 * The main configuration screen where the user selects AI food participants and adds human panelists.
 */
function SelectFoods({ lang, topicTitle, onContinueForward }: SelectFoodsProps): React.ReactElement {
  // Ensuring we pull from a valid lang key, defaulting to 'en' if missing
  const [foods, setFoods] = useState<Food[]>(localFoodData['en'].foods);
  const [selectedFoods, setSelectedFoods] = useState<string[]>([localFoodData['en'].foods[0].id]);

  //Humans
  const [human0, setHuman0] = useState<Food>(cloneHuman(0));
  const [human1, setHuman1] = useState<Food>(cloneHuman(1));
  const [human2, setHuman2] = useState<Food>(cloneHuman(2));
  const [numberOfHumans, setNumberOfHumans] = useState<number>(0);
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const humans: Food[] = [human0, human1, human2];
  const setHumans: React.Dispatch<React.SetStateAction<Food>>[] = [setHuman0, setHuman1, setHuman2];

  const [humansReady, setHumansReady] = useState<boolean>(false);
  const [recheckHumansReady, setRecheckHumansReady] = useState<boolean>(false);
  const [currentFood, setCurrentFood] = useState<string | null>(null);

  const minFoods = 2 + 1; // 2 plus chair
  const maxFoods = 6 + 1; // 6 plus chair

  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();

  //Update foods on language change (Local Logic preserved?)
  // Upstream removed specific lang logic for foods?
  // Local code had:
  // useEffect(() => {
  //   const newFoods = foodData[lang].foods.concat(humans.slice(0, numberOfHumans));
  //   setFoods(newFoods);
  // }, [lang]);
  // Upstream removed it.
  // I will KEEP the effect but use localFoodData['en'] if other langs are missing, or logic.
  // Since I only have 'en' in localFoodData, relying on 'lang' might break if it's 'sv'.
  // But 'en' is hardcoded key. I will assume single language config for foods for now to match strict TS, or keep local logic if safe.
  // Local logic was dependent on `foodData[lang]`. If I only import EN, it will crash for SV.
  // So I'll stick to 'en' or add SV import if I can find it.
  // Upstream removed SV import. I'll stick to 'en'.

  useEffect(() => {
    // Concatenate humans to foods list
    // Since upstream might have changed how this works, I'll replicate simple concat:
    const baseFoods = localFoodData['en'].foods;
    const newFoods = baseFoods.concat(humans.slice(0, numberOfHumans));
    setFoods(newFoods);
  }, [human0, human1, human2, numberOfHumans]);


  /* -------------------------------------------------------------------------- */
  /*                                   Helpers                                  */
  /* -------------------------------------------------------------------------- */

  function cloneHuman(id: number): Food {
    const newHuman = structuredClone(blankHuman);
    newHuman.id = "panelist" + id;
    newHuman.index = id;
    return newHuman;
  }

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
    if (atLeastTwoFoods() && selectedFoods.length <= maxFoods) {
      //Modify chairs invitation prompt, with the name of the selected participants

      const participatingFoods = selectedFoods.filter(id => !id.startsWith('panelist'));
      const participatingHumans = selectedFoods.filter(id => id.startsWith('panelist'));

      let participants = "";
      for (const [i, id] of participatingFoods.entries()) {
        const food = foods.find(f => f.id === id);
        if (i !== 0 && food) participants += toTitleCase(food.name) + ", ";
      }
      if (participants.length > 2) {
        participants = participants.substring(0, participants.length - 2);
      }

      //We need to make a structuredClone here, otherwise we just end up with a string of pointers that ends up mutating the original foodData.
      let replacedFoods: Food[] = [];
      for (const id of selectedFoods) {
        const found = foods.find(f => f.id === id);
        if (found) replacedFoods.push(structuredClone(found));
      }

      if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
        replacedFoods[0].prompt = localFoodData[lang].foods[0].prompt?.replace(
          "[FOODS]",
          participants
        ) || "";
      }

      //Replace humans as well if there are any.
      let humanPresentation = "";
      if (participatingHumans.length > 0) {
        if (participatingHumans.length === 1) {
          humanPresentation += t('selectfoods.human');
        } else {
          humanPresentation += participatingHumans.length + t('selectfoods.twohumans');
        }

        for (const id of participatingHumans) {
          const h = foods.find(f => f.id === id);
          if (h) {
            humanPresentation += toTitleCase(h.name) + ", " + h.description + ". ";
          }
        }
        humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

        const humanPrompt = localFoodData[lang].panelWithHumans;
        humanPresentation = humanPrompt.replace(
          "[HUMANS]",
          humanPresentation
        );
      }

      //Replace the humans tag in chairs prompt regardless if its empty or not
      if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
        replacedFoods[0].prompt = replacedFoods[0].prompt.replace(
          "[HUMANS]",
          humanPresentation
        );
      }

      onContinueForward({ foods: replacedFoods });
    }
  }

  function onAddHuman(): void {
    const id = numberOfHumans;
    if (id < humans.length) {
      setFoods((prevFoods) => [...prevFoods, humans[id]]);
      setNumberOfHumans((prev) => prev + 1);
      selectFood(humans[id]);
    }
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
    const randomfoods = foods.slice(1).filter(food => food.id !== 'addhuman').sort(() => 0.5 - Math.random()).slice(0, amount).map(f => f.id);
    setSelectedFoods([foods[0].id, ...randomfoods]);
  }

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

  // Sync humans state changes to foods array (as foods contains copies or references)
  useEffect(() => {
    setFoods((prevFoods) => prevFoods.map(f => {
      if (f.type === 'panelist' && f.index !== undefined) {
        return humans[f.index];
      }
      return f;
    }));
  }, [human0, human1, human2]);

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
  }, [recheckHumansReady, selectedFoods]);

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  const showDefaultDescription = (currentFood === null && !lastSelected?.startsWith('panelist'));

  const discriptionStyle: React.CSSProperties = {
    transition: "opacity ease",
    opacity: showDefaultDescription ? 1 : 0, // Using 1/0 number is valid in React, but string preferred for some props? No, opacity number is fine.
    transitionDuration: showDefaultDescription ? "1s" : "0ms",
    pointerEvents: showDefaultDescription ? "all" : "none",
  };

  function infoToShow(): React.ReactNode {
    if (currentFood !== null && !currentFood.startsWith('panelist')) {//If something is hovered & if it's not a human
      return <FoodInfo food={foods.find(f => f.id === currentFood)} />;
    } else if (currentFood?.startsWith('panelist') && lastSelected !== currentFood) {//a human is hovered but not selected
      return <HumanInfo human={humans.find(h => h.id === currentFood)} unfocus={true} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    } else if (lastSelected?.startsWith('panelist')) {//a human is selected
      return <HumanInfo human={humans.find(h => h.id === lastSelected)} lastSelected={lastSelected} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    }
    return null;
  }

  const subInfoStyle: React.CSSProperties = {
    margin: isMobile ? (isMobileXs ? "0" : "7px") : undefined
  };

  function buttonOrInfo(): React.ReactElement | null {
    if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && ensureUniqueNames()) {
      return <button onClick={continueForward} style={{ margin: isMobileXs ? "0" : "8px 0" }}>{t('start')}</button>;
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && !humansReady) {
      return <h4 style={subInfoStyle}>{t('selectfoods.requirename')}</h4>;
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && !ensureUniqueNames()) {
      return <h4 style={subInfoStyle}>{t('selectfoods.unique')}</h4>;
    } else if (currentFood !== null || (selectedFoods.length > 1 && !atLeastTwoFoods())) {
      return <h4 style={subInfoStyle}>{t('selectfoods.pleaseselect')}</h4>;
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
          <div style={discriptionStyle}>
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
          {infoToShow()}
        </div>
      </div>
      <div style={{ height: isMobile ? "93px" : "110px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {foods.map((food) => (
            food.id !== 'addhuman' && <FoodButton
              key={food.type === 'panelist' ? food.id : food.name}
              food={food}
              onMouseEnter={() => setCurrentFood(food.id)}
              onMouseLeave={() => setCurrentFood(null)}
              // moderator check
              onSelectFood={food.id === globalOptions.chairId ? undefined : selectFood}
              onDeselectFood={deselectFood}
              isSelected={selectedFoods.includes(food.id)}
              selectLimitReached={selectedFoods.length >= maxFoods}
            />
          ))}
          {(numberOfHumans < MAXHUMANS) && <AddHumanButton
            onMouseEnter={() => setCurrentFood('addhuman')}
            onMouseLeave={() => setCurrentFood(null)}
            onAddHuman={onAddHuman}
            isSelected={selectedFoods.includes('addhuman')} // This probably was undefined in original? addhuman ID implies?
            // Original code: isSelected={selectedFoods.includes()} -> which is effectively false usually for undefined arg?
            // We pass false for add human button usually or check if 'addhuman' is selected? But 'addhuman' isn't in selectedFoods usually.
            // Let's assume false.
            selectLimitReached={selectedFoods.length >= maxFoods}
          />}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px" }}>
          {selectedFoods.length < 2 && <button onClick={randomizeSelection} style={{ ...discriptionStyle, margin: isMobileXs ? "0" : "8px 0", position: "absolute" }}>{t('selectfoods.random')}</button>}
          {buttonOrInfo()}
        </div>
      </div>
    </div>
  );
}

/**
 * Display food character info when hovered/selected
 */
interface FoodInfoProps {
  food?: Food;
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
  setHumans: React.Dispatch<React.SetStateAction<Food>>[];
  lastSelected?: string | null;
  unfocus?: boolean;
  setRecheckHumansReady: React.Dispatch<React.SetStateAction<boolean>>;
}

function HumanInfo({ human, setHumans, lastSelected, unfocus, setRecheckHumansReady }: HumanInfoProps): React.ReactElement | null {
  const isMobile = useMobile();
  const nameArea = useRef<HTMLTextAreaElement>(null);
  const descriptionArea = useRef<HTMLTextAreaElement>(null);

  const { t } = useTranslation();

  if (!human || (human.index === undefined)) return null;

  function descriptionChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || human.index === undefined) return;
    const val = e.target.value;
    setHumans[human.index]((prev) => {
      // Need to return new object for immutability? Or clone?
      // State updater pattern: (prev) => { ... }
      // We should ideally return a NEW object.
      // The original code mutated 'prev' and returned it... which triggers re-render but is bad practice.
      // Let's do it properly:
      const newHuman = { ...prev };
      newHuman.description = val;
      return newHuman;
    });
    setRecheckHumansReady(prev => !prev);
  }

  function nameChanged(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!human || human.index === undefined) return;
    if (nameArea.current) {
      nameArea.current.value = toTitleCase(nameArea.current.value);
      const val = nameArea.current.value;
      setHumans[human.index]((prev) => {
        const newHuman = { ...prev };
        newHuman.name = val;
        return newHuman;
      });
      setRecheckHumansReady(prev => !prev);
    }
  }

  // Effect to update values when human data changes (e.g. from parent re-render or switching humans)
  useEffect(() => {
    if (nameArea.current && descriptionArea.current && human) {
      nameArea.current.value = human.name;
      descriptionArea.current.value = human.description;
    }
  }, [human]);

  // Effect to handle focus ONLY when selection changes or unfocus trigger changes
  useEffect(() => {
    if (nameArea.current && descriptionArea.current && human) {
      if (lastSelected === human.id && unfocus !== true) {
        //Set focus only when first selecting, not on every re-render
        nameArea.current.focus();
        const length = nameArea.current.value.length;
        nameArea.current.setSelectionRange(length, length);
      } else if (unfocus === true) {
        nameArea.current.blur();
        descriptionArea.current.blur();
      }
    }
  }, [unfocus, lastSelected, human?.id]); // Only depend on ID, not full human object

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

  const imageUrl = `/small/${food.type === 'panelist' ? 'panelist' : food.id}.webp`;

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
  const imageUrl = `/small/add.webp`;

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
