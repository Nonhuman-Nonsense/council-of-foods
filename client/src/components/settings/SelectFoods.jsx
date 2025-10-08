import { useState, useRef, useEffect } from "react";
import foodData from "../../prompts/foods.json";
import { toTitleCase, useMobile, useMobileXs, filename } from "../../utils";

const MAXHUMANS = 3;

//Freeze original foodData to make it immutable
Object.freeze(foodData);
for (let i = 0; i < foodData.foods.length; i++) {
  Object.freeze(foodData.foods[i]);
}

const addHuman = {
  name: "Add Human",
  description: "Would you like to add a human speaker to the meeting?\n\nCreate a panel consisting of both humans and foods."
};

const blankHuman = {
  type: "panelist",
  name: "",
  description: ""
};

function SelectFoods({ topic, onContinueForward }) {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();

  //Foods
  const [foods, setFoods] = useState(foodData.foods);
  const waterFood = foods[0];

  //Humans
  const [human0, setHuman0] = useState(cloneHuman(0));
  const [human1, setHuman1] = useState(cloneHuman(1));
  const [human2, setHuman2] = useState(cloneHuman(2));
  const [numberOfHumans, setNumberOfHumans] = useState(0);
  const [lastSelected, setLastSelected] = useState(null);
  const humans = [human0, human1, human2];
  const setHumans = [setHuman0, setHuman1, setHuman2];
  const [humansReady, setHumansReady] = useState(false);
  const [recheckHumansReady, setRecheckHumansReady] = useState(false);

  // Initialize selectedFoods with the 'water' item if it exists
  const [selectedFoods, setSelectedFoods] = useState(
    waterFood ? [waterFood] : []
  );
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2 + 1; // 2 plus water
  const maxFoods = 6 + 1; // 6 plus water

  function cloneHuman(id) {
    const newHuman = structuredClone(blankHuman);
    newHuman.id = id;
    return newHuman;
  }

  function atLeastTwoFoods() {
    return (selectedFoods.filter((f) => f.type !== 'panelist').length >= minFoods);
  }

  function continueForward() {
    if (atLeastTwoFoods() && selectedFoods.length <= maxFoods) {
      //Modify waters invitation prompt, with the name of the selected participants

      const participatingFoods = selectedFoods.filter((participant) => participant.type !== 'panelist');
      const participatingHumans = selectedFoods.filter((participant) => participant.type === 'panelist');

      let participants = "";
      participatingFoods.forEach(function (food, index) {
        if (index !== 0) participants += toTitleCase(food.name) + ", ";
      });
      participants = participants.substring(0, participants.length - 2);

      //We need to make a structuredClone here, otherwise we just end up with a string of pointers that ends up mutating the original foodData.
      let replacedFoods = structuredClone(selectedFoods);
      replacedFoods[0].prompt = foodData.foods[0].prompt.replace(
        "[FOODS]",
        participants
      );

      //Replace humans as well if there are any.
      let humanPresentation = "";
      if (participatingHumans.length > 0) {
        if (participatingHumans.length === 1) {
          humanPresentation += "1 human: ";
        } else {
          humanPresentation += participatingHumans.length + " humans: ";
        }

        participatingHumans.forEach((human) => {
          humanPresentation += toTitleCase(human.name) + ", " + human.description + ". ";
        });

        const humanPrompt = structuredClone(foodData.panelWithHumans);
        humanPresentation = humanPrompt.replace(
          "[HUMANS]",
          humanPresentation
        );
      }

      //Replace the humans tag in waters prompt regardless if its empty or not
      replacedFoods[0].prompt = replacedFoods[0].prompt.replace(
        "[HUMANS]",
        humanPresentation
      );

      onContinueForward({ foods: replacedFoods });
    }
  }

  function handleOnMouseEnter(food) {
    setCurrentFood(food);
  }

  function handleOnMouseLeave() {
    setCurrentFood(null);
  }

  function onAddHuman() {
    const id = numberOfHumans;
    setFoods((prevFoods) => [...prevFoods, humans[id]]);
    setNumberOfHumans((prev) => prev + 1);
    selectFood(humans[id]);
  }

  function selectFood(food) {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(food)) {
      setSelectedFoods((prevFoods) => [...prevFoods, food]);
      setLastSelected(food);
    }
  }

  function deselectFood(food) {
    //Human button is clicked that is already selected, but is not lastSelection, focus on it instead
    if (food.type === 'panelist' && lastSelected !== food) {
      setLastSelected(food);
    } else {
      //Normal deselection
      setSelectedFoods((prevFoods) => prevFoods.filter((f) => f !== food));
      setLastSelected(null);
    }
  }

  function randomizeSelection() {
    const amount = Math.floor(Math.random() * (maxFoods - minFoods + 1)) + minFoods - 1;
    const randomfoods = foods.slice(1).sort(() => 0.5 - Math.random()).slice(0, amount);
    setSelectedFoods([waterFood, ...randomfoods]);
  }

  useEffect(() => {
    const selectedHumans = selectedFoods.filter((food) => food.type === 'panelist');
    let ready = true;
    selectedHumans.forEach(human => {
      if (human.name.length === 0 || human.description.length === 0) {
        ready = false;
      }
    });
    setHumansReady(ready);
  }, [recheckHumansReady, selectedFoods]);

  const showDefaultDescription = (currentFood === null && lastSelected?.type !== 'panelist');

  const discriptionStyle = {
    transition: "opacity ease",
    opacity: showDefaultDescription ? 1 : 0,
    transitionDuration: showDefaultDescription ? "1s" : "0ms",
    pointerEvents: showDefaultDescription ? "all" : "none",
  };

  function infoToShow() {
    if (currentFood !== null && currentFood.type !== 'panelist') {//If something is hovered & if it's not a human
      return <FoodInfo food={currentFood} />;
    } else if (currentFood?.type === 'panelist' && lastSelected !== currentFood) {//a human is hovered but not selected
      return <HumanInfo human={currentFood} unfocus={true} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    } else if (lastSelected?.type === 'panelist') {//a human is selected
      return <HumanInfo human={lastSelected} lastSelected={lastSelected} setHumans={setHumans} setRecheckHumansReady={setRecheckHumansReady} />;
    }
  }

  function buttonOrInfo() {
    if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && humansReady) {
      return <button onClick={continueForward} style={{ margin: isMobileXs ? "0" : "8px 0" }}>Start</button>;
    } else if (atLeastTwoFoods() && selectedFoods.length <= maxFoods && !humansReady) {
      return <h4 style={{ margin: isMobile && (isMobileXs ? "0" : "7px") }}>all participating humans must have name and description</h4>;
    } else if (currentFood !== null || (selectedFoods.length > 1 && !atLeastTwoFoods())) {
      return <h4 style={{ margin: isMobile && (isMobileXs ? "0" : "7px") }}>please select 2-6 foods for the discussion</h4>;
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
        <h1 style={{ margin: isMobile && "0" }}>THE FOODS</h1>
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
            <p style={{ margin: 0 }}>Council of Foods meeting on</p>
            <h3>{toTitleCase(topic.title)}</h3>
            <div>
              {!atLeastTwoFoods() ? <p>please select 2-6 foods for the discussion</p> : <><p>will be attended by:</p>
                <div>{selectedFoods.map((food) => <p style={{ margin: 0 }} key={food.type === 'panelist' ? food.id : food.name}>{food.name}</p>)}</div>
              </>}
            </div>
          </div>
          {infoToShow()}
        </div>
      </div>
      <div style={{ height: isMobile ? "93px" : "110px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {foods.map((food) => (
            <FoodButton
              key={food.type === 'panelist' ? food.id : food.name}
              food={food}
              onMouseEnter={() => handleOnMouseEnter(food)}
              onMouseLeave={handleOnMouseLeave}
              onSelectFood={food === waterFood ? undefined : selectFood}
              onDeselectFood={deselectFood}
              isSelected={selectedFoods.includes(food)}
              selectLimitReached={selectedFoods.length >= maxFoods}
            />
          ))}
          {(numberOfHumans < MAXHUMANS) && <AddHumanButton
            onMouseEnter={() => handleOnMouseEnter(addHuman)}
            onMouseLeave={handleOnMouseLeave}
            onAddHuman={onAddHuman}
            isSelected={selectedFoods.includes()}
            selectLimitReached={selectedFoods.length >= maxFoods}
          />}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px" }}>
          {selectedFoods.length < 2 && <button onClick={randomizeSelection} style={{ ...discriptionStyle, margin: isMobileXs ? "0" : "8px 0", position: "absolute" }}>Randomize</button>}
          {buttonOrInfo()}
        </div>
      </div>
    </div>
  );
}

function FoodInfo({ food }) {
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
      <p style={{ margin: isMobile ? "0" : "", whiteSpace: "pre-wrap" }}>{food.description?.split('\n').map((item, key) => {
        return <span key={key}>{item}<br /></span>
      })}
      </p>
    </div>
  );
}

function HumanInfo({ human, setHumans, lastSelected, unfocus, setRecheckHumansReady }) {
  const isMobile = useMobile();
  const nameArea = useRef(null);
  const descriptionArea = useRef(null);

  function descriptionChanged(e) {
    setHumans[human.id]((prev) => {
      prev.description = descriptionArea.current.value;
      return prev;
    });
    setRecheckHumansReady(prev => !prev);
  }

  function nameChanged(e) {
    nameArea.current.value = toTitleCase(nameArea.current.value);
    setHumans[human.id]((prev) => {
      prev.name = nameArea.current.value;
      return prev;
    });
    setRecheckHumansReady(prev => !prev);
  }

  useEffect(() => {
    //If we change from one human to another, also update the values
    nameArea.current.value = human.name;
    descriptionArea.current.value = human.description;
    if (lastSelected === human && unfocus !== true) {
      //Set focus
      nameArea.current.focus();
      //Set cursor to end
      const length = nameArea.current.value.length;
      nameArea.current.setSelectionRange(length, length);
    } else if (unfocus === true) {
      nameArea.current.blur();
      descriptionArea.current.blur();
    }
  }, [unfocus, lastSelected]);

  const textStyle = {
    backgroundColor: "transparent",
    width: "100%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "'Tinos', sans-serif",
    fontSize: isMobile ? "15px" : "18px",
    margin: isMobile && "0",
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
        placeholder={"Human Name"}
        defaultValue={human.name}
      />
      <textarea
        ref={descriptionArea}
        style={descStyle}
        onChange={descriptionChanged}
        className="unfocused"
        maxLength={900}
        defaultValue={human.description}
        placeholder={"Enter a description for the human..."}
      />
    </div>
  );
}

function FoodButton({
  food,
  onSelectFood,
  onDeselectFood,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}) {
  const isMobile = useMobile();
  const isModerator = onSelectFood === undefined;

  const imageUrl = `/foods/small/${food.type === 'panelist' ? 'panelist' : filename(food.name)}.webp`;

  function handleClickFood() {
    if (!isModerator && (!selectLimitReached || isSelected)) {
      if (!isSelected) {
        onSelectFood?.(food);
      } else {
        onDeselectFood?.(food);
      }
    }
  }

  const buttonStyle = {
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

  const imageStyle = {
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


function AddHumanButton({
  onAddHuman,
  onMouseEnter,
  onMouseLeave,
  isSelected,
  selectLimitReached,
}) {
  const isMobile = useMobile();
  const imageUrl = `/foods/small/add.webp`;

  function handleAddHuman() {
    if ((!selectLimitReached)) {
      onAddHuman();
    }
  }

  const buttonStyle = {
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

  const imageStyle = {
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
