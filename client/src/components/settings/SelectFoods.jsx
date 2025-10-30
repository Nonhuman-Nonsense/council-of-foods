import { useState, useEffect } from "react";
import FoodButton from "./FoodButton";
import { toTitleCase, useMobile, useMobileXs } from "../../utils";
import { useTranslation } from "react-i18next";

//Foods
import foodDataEN from "../../prompts/foods.json";
import foodDataSV from "../../prompts/foods_sv.json";
import { useParams } from "react-router";

const foodData = {
  "en": foodDataEN.foods,
  "sv": foodDataSV.foods
};

//Freeze original topicData to make it immutable
Object.freeze(foodData);
for (const language in foodData) {
  for (let i = 0; i < foodData[language].length; i++) {
    Object.freeze(foodData[language][i]);
  }
}

function SelectFoods({ topicTitle, onContinueForward }) {
  const [foods, setFoods] = useState(foodData['en']); // Make sure this is defined before using it to find 'water'
  const [selectedFoods, setSelectedFoods] = useState([foodData['en'][0].id]);
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2 + 1; // 2 plus water
  const maxFoods = 6 + 1; // 6 plus water

  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();

  let { lang } = useParams();

  //Update foods on language change
  useEffect(() => {
    setFoods(foodData[lang]);
  }, [lang]);

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      //Modify waters invitation prompt, with the name of the selected participants
      let participants = "";
      selectedFoods.forEach(function (id, index) {
        if (index !== 0) participants += toTitleCase(foods.find(f => f.id === id).name) + ", ";
      });
      participants = participants.substring(0, participants.length - 2);

      //We need to make a structuredClone here, otherwise we just end up with a string of pointers that ends up mutating the original foodData.
      let replacedFoods = structuredClone(foods.filter(f => selectedFoods.includes(f.id)));
      replacedFoods[0].prompt = foodData[lang][0].prompt.replace(
        "[FOODS]",
        participants
      );

      console.log(replacedFoods);
      onContinueForward({ foods: replacedFoods });
    }
  }

  function selectFood(food) {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(food.id)) {
      setSelectedFoods((prevFoods) => [...prevFoods, food.id]);
    }
  }

  function randomizeSelection() {
    const amount = Math.floor(Math.random() * (maxFoods - minFoods + 1)) + minFoods - 1;
    const randomfoods = foods.slice(1).sort(() => 0.5 - Math.random()).slice(0, amount).map(f => f.id);
    setSelectedFoods([foods[0].id, ...randomfoods]);
  }

  function deselectFood(food) {
    setSelectedFoods((prevFoods) => prevFoods.filter((id) => id !== food.id));
  }

  const discriptionStyle = {
    transition: "opacity ease",
    opacity: currentFood === null ? 1 : 0,
    transitionDuration: currentFood === null ? "1s" : "0ms",
    pointerEvents: currentFood === null ? "all" : "none",
  };

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
        <h1 style={{margin: isMobile && "0"}}>{t('thebeings')}</h1>
        <div
          style={{
            position: "relative",
            height: isMobile ? (isMobileXs ? "190px" :"240px") :"380px",
            width: isMobile ? "587px" : "500px"
          }}
        >
          <div style={discriptionStyle}>
            <p style={{margin: 0}}>{t('meetingon')}</p>
            <h3>{topicTitle && toTitleCase(topicTitle)}</h3>
            <div>
              {selectedFoods.length < 2 ? <p>{t('selectbeings')}</p> : <><p>{t('wewilllisten')}:</p>
                <div>{selectedFoods.map((id) => <p style={{margin: 0}} key={foods.find(f => f.id === id).name}>{foods.find(f => f.id === id).name}</p>)}</div>
                </>}
            </div>
          </div>
          <FoodInfo food={foods.find(f => f.id === currentFood)} />
        </div>
      </div>
      <div style={{height: isMobile ? "93px" : "110px"}}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {foods.map((food) => (
            <FoodButton
              key={food.name}
              food={food}
              onMouseEnter={() => setCurrentFood(food.id)}
              onMouseLeave={() => setCurrentFood(null)}
              onSelectFood={food.id === 'river' ? undefined : selectFood}
              onDeselectFood={deselectFood}
              isSelected={selectedFoods.includes(food.id)}
              selectLimitReached={selectedFoods.length >= maxFoods}
            />
          ))}
        </div>
        <div style={{display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px"}}>
        {selectedFoods.length < 2 && <button onClick={randomizeSelection} style={{...discriptionStyle, margin: isMobileXs ? "0" : "8px 0", position: "absolute"}}>{t('randomize')}</button>}
        {selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods ?
          <button onClick={continueForward} style={{margin: isMobileXs ? "0" : "8px 0"}}>{t('start')}</button> :
          (currentFood !== null || selectedFoods.length === 2) && <h4 style={{margin: isMobile && (isMobileXs ? "0" : "7px")}}>{t('selectbeingsdiscussion')}</h4>
        }
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
      <h2 style={{margin: isMobile ? "0" : "-15px 0 0 0"}}>{toTitleCase(food.name)}</h2>
      <p style={{margin: isMobile ? "0" : ""}}>{food.description?.split('\n').map((item, key) => {
          return <span key={key}>{item}<br/></span>
        })}
      </p>
    </div>
  );
}

export default SelectFoods;
