import { useState, useRef, useEffect, ChangeEvent } from "react";
import { toTitleCase, useMobile, useMobileXs } from "../../utils";
import { useTranslation } from "react-i18next";
import globalOptions from "../../global-options-client.json";
//Foods
import foodDataEN from "../../prompts/foods_en.json";
import { Character } from "@shared/ModelTypes";

// Define local interfaces for the JSON structure
interface FoodDataJSON {
    foods: Character[];
    panelWithHumans: string;
    [key: string]: any;
}

interface FoodDataMap {
    [key: string]: FoodDataJSON;
}

const foodData: FoodDataMap = {
    "en": foodDataEN as any // Cast because JSON import might be loose or slightly specific
};

const MAXHUMANS = 3;

//Freeze original foodData to make it immutable
Object.freeze(foodData);
for (const language in foodData) {
    for (let i = 0; i < foodData[language].foods.length; i++) {
        Object.freeze(foodData[language].foods[i]);
    }
}

const blankHuman: Character = {
    id: "", // Will be set on clone
    type: "panelist",
    name: "",
    description: "",
    voice: "" // Added to satisfy Character interface
};

interface SelectFoodsProps {
    lang: string;
    topicTitle: string;
    onContinueForward: (data: { foods: Character[] }) => void;
}

/**
 * SelectFoods Component
 * 
 * The main configuration screen where the user selects AI food participants and adds human panelists.
 * 
 * Core Logic:
 * - **Participant Management**: Maintains state for both AI foods and Human panelists.
 * - **Validation**: Ensures minimum (2) and maximum (6) participants.
 * - **Human Panelists**: Allows adding up to 3 manual human entries (`panelist0`, `panelist1`, etc.).
 * - **Prompt Engineering**: Dynamically constructs the system prompt based on selected characters.
 */
function SelectFoods({ lang, topicTitle, onContinueForward }: SelectFoodsProps): JSX.Element {
    const [foods, setFoods] = useState<Character[]>(foodData['en'].foods); // Make sure this is defined before using it to find chair
    const [selectedFoods, setSelectedFoods] = useState<string[]>([foodData['en'].foods[0].id]);

    //Humans
    const [human0, setHuman0] = useState<Character>(cloneHuman(0));
    const [human1, setHuman1] = useState<Character>(cloneHuman(1));
    const [human2, setHuman2] = useState<Character>(cloneHuman(2));
    const [numberOfHumans, setNumberOfHumans] = useState<number>(0);
    const [lastSelected, setLastSelected] = useState<string | null>(null);
    const humans = [human0, human1, human2];
    const setHumans = [setHuman0, setHuman1, setHuman2];
    const [humansReady, setHumansReady] = useState<boolean>(false);
    const [recheckHumansReady, setRecheckHumansReady] = useState<boolean>(false);
    const [currentFood, setCurrentFood] = useState<string | null>(null);

    const minFoods = 2 + 1; // 2 plus chair
    const maxFoods = 6 + 1; // 6 plus chair

    const isMobile = useMobile();
    const isMobileXs = useMobileXs();
    const { t } = useTranslation();

    // //Update foods on language change
    // useEffect(() => {
    //   const newFoods = foodData[lang].foods.concat(humans.slice(0,numberOfHumans));
    //   setFoods(newFoods);
    // }, [lang]);

    /* -------------------------------------------------------------------------- */
    /*                                   Helpers                                  */
    /* -------------------------------------------------------------------------- */

    function cloneHuman(id: number): Character {
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
        return (new Set(names).size === names.length);
    }

    /* -------------------------------------------------------------------------- */
    /*                                  Handlers                                  */
    /* -------------------------------------------------------------------------- */

    function continueForward() {
        if (atLeastTwoFoods() && selectedFoods.length <= maxFoods) {
            //Modify chairs invitation prompt, with the name of the selected participants

            const participatingFoods = selectedFoods.filter(id => !id.startsWith('panelist'));
            const participatingHumans = selectedFoods.filter(id => id.startsWith('panelist'));

            let participants = "";
            for (const [i, id] of participatingFoods.entries()) {
                if (i !== 0) participants += toTitleCase(foods.find(f => f.id === id)?.name || "") + ", ";
            }
            participants = participants.substring(0, participants.length - 2);

            //We need to make a structuredClone here, otherwise we just end up with a string of pointers that ends up mutating the original foodData.
            let replacedFoods: Character[] = [];
            for (const id of selectedFoods) {
                const found = foods.find(f => f.id === id);
                if (found) replacedFoods.push(structuredClone(found));
            }

            replacedFoods[0].prompt = foodData[lang].foods[0].prompt.replace(
                "[FOODS]",
                participants
            );

            //Replace humans as well if there are any.
            let humanPresentation = "";
            if (participatingHumans.length > 0) {
                if (participatingHumans.length === 1) {
                    humanPresentation += t('selectfoods.human');
                } else {
                    humanPresentation += participatingHumans.length + t('selectfoods.twohumans');
                }

                for (const id of participatingHumans) {
                    const f = foods.find(f => f.id === id);
                    if (f) humanPresentation += toTitleCase(f.name) + ", " + f.description + ". ";
                }
                humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

                const humanPrompt = foodData[lang].panelWithHumans;
                humanPresentation = humanPrompt.replace(
                    "[HUMANS]",
                    humanPresentation
                );
            }

            //Replace the humans tag in chairs prompt regardless if its empty or not
            replacedFoods[0].prompt = replacedFoods[0].prompt.replace(
                "[HUMANS]",
                humanPresentation
            );

            onContinueForward({ foods: replacedFoods });
        }
    }

    function onAddHuman() {
        const id = numberOfHumans;
        setFoods((prevFoods) => [...prevFoods, humans[id]]);
        setNumberOfHumans((prev) => prev + 1);
        selectFood(humans[id]);
    }

    function selectFood(food: Character) {
        if (selectedFoods.length < maxFoods && !selectedFoods.includes(food.id)) {
            setSelectedFoods((prevFoods) => [...prevFoods, food.id]);
            setLastSelected(food.id);
        }
    }

    function deselectFood(food: Character) {
        //Human button is clicked that is already selected, but is not lastSelection, focus on it instead
        if (food.type === 'panelist' && lastSelected !== food.id) {
            setLastSelected(food.id);
        } else {
            //Normal deselection
            setSelectedFoods((prevFoods) => prevFoods.filter((f) => f !== food.id));
            setLastSelected(null);
        }
    }

    function randomizeSelection() {
        const amount = Math.floor(Math.random() * (maxFoods - minFoods + 1)) + minFoods - 1;
        const randomfoods = foods.slice(1).filter(food => food.id !== 'addhuman').sort(() => 0.5 - Math.random()).slice(0, amount).map(f => f.id);
        setSelectedFoods([foods[0].id, ...randomfoods]);
    }

    /* -------------------------------------------------------------------------- */
    /*                                   Effects                                  */
    /* -------------------------------------------------------------------------- */

    useEffect(() => {
        const selectedHumans = selectedFoods.filter(id => id.startsWith('panelist'));
        let ready = true;
        for (const humanId of selectedHumans) {
            const i = Number(humanId.slice(-1));
            if (humans[i].name.length === 0 || humans[i].description.length === 0) {
                ready = false;
            }
        }
        setHumansReady(ready);
    }, [recheckHumansReady, selectedFoods]);

    /* -------------------------------------------------------------------------- */
    /*                                   Render                                   */
    /* -------------------------------------------------------------------------- */

    const showDefaultDescription = (currentFood === null && !lastSelected?.startsWith('panelist'));

    const discriptionStyle: any = {
        transition: "opacity ease",
        opacity: showDefaultDescription ? 1 : 0,
        transitionDuration: showDefaultDescription ? "1s" : "0ms",
        pointerEvents: showDefaultDescription ? "all" : "none",
    };

    function infoToShow() {
        if (currentFood !== null && !currentFood.startsWith('panelist')) {//If something is hovered & if it's not a human
            return <FoodInfo food={foods.find(f => f.id === currentFood)} />;
        } else if (currentFood?.startsWith('panelist') && lastSelected !== currentFood) {//a human is hovered but not selected
            return <HumanInfo human={humans.find(h => h.id === currentFood)} unfocus={true} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
        } else if (lastSelected?.startsWith('panelist')) {//a human is selected
            return <HumanInfo human={humans.find(h => h.id === lastSelected)} lastSelected={lastSelected} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
        }
    }

    const subInfoStyle = {
        margin: isMobile ? (isMobileXs ? "0" : "7px") : undefined
    };

    function buttonOrInfo() {
        if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && ensureUniqueNames()) {
            return <button onClick={continueForward} style={{ margin: isMobileXs ? "0" : "8px 0" }}>{t('start')}</button>;
        } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && !humansReady) {
            return <h4 style={subInfoStyle}>{t('selectfoods.requirename')}</h4>;
        } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady && !ensureUniqueNames()) {
            return <h4 style={subInfoStyle}>{t('selectfoods.unique')}</h4>;
        } else if (currentFood !== null || (selectedFoods.length > 1 && !atLeastTwoFoods())) {
            return <h4 style={subInfoStyle}>{t('selectfoods.pleaseselect')}</h4>;
        }
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
                                <div>{selectedFoods.map((id) => <p style={{ margin: 0 }} key={id.startsWith('panelist') ? id : foods.find(f => f.id === id)?.name}>{foods.find(f => f.id === id)?.name}</p>)}</div>
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
                        isSelected={false} // Was empty in original: isSelected={selectedFoods.includes()}
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

interface FoodInfoProps {
    food?: Character;
}

/**
 * Display food character info when hovered/selected
 */
function FoodInfo({ food }: FoodInfoProps): JSX.Element | null {
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
            <p style={{ margin: isMobile ? "0" : "", whiteSpace: "pre-wrap" }}>{food.description?.split('\n').map((item: string, key: number) => {
                return <span key={key}>{item}<br /></span>
            })}
            </p>
        </div>
    );
}

interface HumanInfoProps {
    human?: Character;
    setHumans: any[]; // Array of setters
    lastSelected?: string | null;
    unfocus?: boolean;
    setRecheckHumansReady: (cb: (prev: boolean) => boolean) => void;
}

/**
 * Editable form for human panelists
 */
function HumanInfo({ human, setHumans, lastSelected, unfocus, setRecheckHumansReady }: HumanInfoProps): JSX.Element | null {
    const isMobile = useMobile();
    const nameArea = useRef<HTMLTextAreaElement>(null);
    const descriptionArea = useRef<HTMLTextAreaElement>(null);

    const { t } = useTranslation();

    if (!human) return null;

    function descriptionChanged(e: ChangeEvent<HTMLTextAreaElement>) {
        if (descriptionArea.current) {
            const val = e.target.value;
            setHumans[human!.index]((prev: Character) => {
                prev.description = val;
                return prev;
            });
            setRecheckHumansReady(prev => !prev);
        }
    }

    function nameChanged(e: ChangeEvent<HTMLTextAreaElement>) {
        if (nameArea.current) {
            nameArea.current.value = toTitleCase(e.target.value);
            const val = nameArea.current.value;
            setHumans[human!.index]((prev: Character) => {
                prev.name = val;
                return prev;
            });
            setRecheckHumansReady(prev => !prev);
        }
    }

    useEffect(() => {
        if (nameArea.current && descriptionArea.current) {
            //If we change from one human to another, also update the values
            nameArea.current.value = human!.name;
            descriptionArea.current.value = human!.description;
            if (lastSelected === human!.id && unfocus !== true) {
                //Set focus
                nameArea.current.focus();
                //Set cursor to end
                const length = nameArea.current.value.length;
                nameArea.current.setSelectionRange(length, length);
            } else if (unfocus === true) {
                nameArea.current.blur();
                descriptionArea.current.blur();
            }
        }
    }, [unfocus, lastSelected, human]);

    const textStyle: any = {
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

    const nameStyle = {
        ...textStyle,
        margin: isMobile ? "0" : "-12px 0 0 0",
        fontSize: "39px",
        height: "45px"
    };

    const descStyle = {
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
    food: Character;
    onSelectFood?: (food: Character) => void;
    onDeselectFood?: (food: Character) => void;
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
}: FoodButtonProps): JSX.Element {
    const isMobile = useMobile();
    const isModerator = onSelectFood === undefined;

    const imageUrl = `/foods/small/${food.type === 'panelist' ? 'panelist' : food.id}.webp`;

    function handleClickFood() {
        if (!isModerator && (!selectLimitReached || isSelected)) {
            if (!isSelected) {
                onSelectFood?.(food);
            } else {
                onDeselectFood?.(food);
            }
        }
    }

    const buttonStyle: any = {
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

    const imageStyle: any = {
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
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    isSelected: boolean;
    selectLimitReached: boolean;
}

function AddHumanButton({
    onAddHuman,
    onMouseEnter,
    onMouseLeave,
    isSelected,
    selectLimitReached,
}: AddHumanButtonProps): JSX.Element {
    const isMobile = useMobile();
    const imageUrl = `/foods/small/add.webp`;

    function handleAddHuman() {
        if ((!selectLimitReached)) {
            onAddHuman();
        }
    }

    const buttonStyle: any = {
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

    const imageStyle: any = {
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
