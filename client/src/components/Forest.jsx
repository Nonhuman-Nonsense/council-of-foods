import React, { useState, useEffect, useRef } from "react";
import FoodAnimation from "./FoodAnimation.jsx";

function Forest({ currentSpeakerName, isPaused }) {

    //Zooming variables
    const [zoomInOnBeing, setZoomInOnBeing] = useState(null);
    const containerRef = useRef(null);
    const [randomCharacters, setRandomCharacters] = useState([]);
    const [zoomInValue, setZoomInValue] = useState(1);
    const [offsetValue, setOffsetValue] = useState([0, 0]);
    const [translateValue, setTranslateValue] = useState([0, 0]);

    useEffect(() => {
        let randomizedCharacters = characters.sort(() => 0.5 - Math.random());
        setRandomCharacters(randomizedCharacters);
    }, []);

    const unit = {
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
    };

    const tall = {
        ...unit,
        gridColumn: "span 1",
        gridRow: "span 2",
    };

    const wide = {
        ...unit,
        gridRow: "span 1",
        gridColumn: "span 2",
    };

    const square = {
        ...unit,
        gridRow: "span 1",
        gridColumn: "span 1",
    }

    const double = {
        ...unit,
        gridRow: "span 2",
        gridColumn: "span 2",
    }

    const characters = [
        { ref: useRef(null), name: "Beetle", style: square, },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Flaming Pine", style: square },
        { ref: useRef(null), name: "Flaming Pine2", style: square },
        { ref: useRef(null), name: "Flying Bird", style: double },
        { ref: useRef(null), name: "Insect", style: square },
        { ref: useRef(null), name: "Lichen", style: square },
        { ref: useRef(null), name: "Log", style: double },
        { ref: useRef(null), name: "Mosquito", style: square },
        { ref: useRef(null), name: "Moth", style: wide },
        { ref: useRef(null), name: "Pine", style: tall },
        { ref: useRef(null), name: "Reindeer House", style: double },
        { ref: useRef(null), name: "Reindeer", style: wide },
        { ref: useRef(null), name: "Salmon", style: wide },
        { ref: useRef(null), name: "Saw", style: square },
        { ref: useRef(null), name: "Saw2", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Flaming Pine", style: square },
        { ref: useRef(null), name: "Flaming Pine2", style: square },
        { ref: useRef(null), name: "Flying Bird", style: double },
        { ref: useRef(null), name: "Insect", style: square },
        { ref: useRef(null), name: "Lichen", style: square },
        { ref: useRef(null), name: "Log", style: double },
        { ref: useRef(null), name: "Mosquito", style: square },
        { ref: useRef(null), name: "Moth", style: wide },
        { ref: useRef(null), name: "Pine", style: tall },
        { ref: useRef(null), name: "Reindeer House", style: double },
        { ref: useRef(null), name: "Reindeer", style: wide },
        { ref: useRef(null), name: "Salmon", style: wide },
        { ref: useRef(null), name: "Saw", style: square },
        { ref: useRef(null), name: "Saw2", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Flaming Pine", style: square },
        { ref: useRef(null), name: "Flaming Pine2", style: square },
        { ref: useRef(null), name: "Flying Bird", style: double },
        { ref: useRef(null), name: "Insect", style: square },
        { ref: useRef(null), name: "Lichen", style: square },
        { ref: useRef(null), name: "Log", style: double },
        { ref: useRef(null), name: "Mosquito", style: square },
        { ref: useRef(null), name: "Moth", style: wide },
        { ref: useRef(null), name: "Pine", style: tall },
        { ref: useRef(null), name: "Reindeer House", style: double },
        { ref: useRef(null), name: "Reindeer", style: wide },
        { ref: useRef(null), name: "Salmon", style: wide },
        { ref: useRef(null), name: "Saw", style: square },
        { ref: useRef(null), name: "Saw2", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
        { ref: useRef(null), name: "Boletus", style: square },
        { ref: useRef(null), name: "Butterfly", style: square },
        { ref: useRef(null), name: "Flaming Pine", style: square },
        { ref: useRef(null), name: "Flaming Pine2", style: square },
        { ref: useRef(null), name: "Flying Bird", style: double },
        { ref: useRef(null), name: "Insect", style: square },
        { ref: useRef(null), name: "Lichen", style: square },
        { ref: useRef(null), name: "Log", style: double },
        { ref: useRef(null), name: "Mosquito", style: square },
        { ref: useRef(null), name: "Moth", style: wide },
        { ref: useRef(null), name: "Pine", style: tall },
        { ref: useRef(null), name: "Reindeer House", style: double },
        { ref: useRef(null), name: "Reindeer", style: wide },
        { ref: useRef(null), name: "Salmon", style: wide },
        { ref: useRef(null), name: "Saw", style: square },
        { ref: useRef(null), name: "Saw2", style: square },
        { ref: useRef(null), name: "Beetle", style: square },
        { ref: useRef(null), name: "Birch", style: tall },
    ];

    const container = {
        position: "absolute",
        backgroundColor: "black",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "flex",
        zIndex: "-3",
        transform: `scale(${zoomInValue}) translate(${translateValue[0]}px, ${translateValue[1]}px)`,
        transformOrigin: `${offsetValue[0]}px ${offsetValue[1]}px`,
        transition: "transform 2s ease-out"
    };

    const river = {
        zIndex: "-5",
    };

    const grid = {
        maxWidth: "100%",
        maxHeight: "100%",
        display: "grid",
        margin: "0 auto",
        gridTemplateColumns: "repeat(auto-fill, 75px)",
        gridAutoRows: "75px",
        gridAutoFlow: "row dense",
        gridGap: "0",
        // overflow: "hidden"
    };


    useEffect(() => {
        //find the current speaker in the list of characters
        console.log(currentSpeakerName);
        const found = characters.find((char) => char.name === currentSpeakerName);
        if (found) {
            setZoomInOnBeing(found.ref);
        } else {
            setZoomInOnBeing(null);
        }
    }, [currentSpeakerName]);

    useEffect(() => {
        if (zoomInOnBeing) {
            const container = containerRef.current.getBoundingClientRect();
            const screenHeight = container.height;
            const screenWidth = container.width;
            console.log(zoomInOnBeing.current);
            const zoom = 6;
            setZoomInValue(zoom);
            const box = zoomInOnBeing.current.getBoundingClientRect();
            const left = box.left + (box.right - box.left) / 2;
            const top = box.top + (box.bottom - box.top) / 2;
            setOffsetValue([left, top]);
            setTranslateValue([(screenWidth / 2 - left) / zoom, (screenHeight / 2 - top) / zoom]);
        } else {
            setZoomInValue(1);
            // setOffsetValue([0, 0]);
            setTranslateValue([0, 0]);
        }
    }, [zoomInOnBeing]);


    return (
        <div style={container} ref={containerRef}>
            <div style={{ flex: 1 }}>
                <div style={grid}>
                    {randomCharacters.slice(0, randomCharacters.length / 2).map((character, index) => (
                        <div style={character.style} key={index} ref={character.ref}>
                            <FoodAnimation
                                character={{ name: character.name }}
                                styles={{ maxWidth: "100%", maxHeight: "100%" }}
                                currentSpeakerName={currentSpeakerName}
                                isPaused={isPaused}
                            />
                        </div>
                    ))}
                </div>
            </div>
            <FoodAnimation character={{ name: "River" }} styles={river} isPaused={isPaused} />
            <div style={{ flex: 1 }}>
                <div style={grid}>
                    {randomCharacters.slice(randomCharacters.length / 2).map((character, index) => (
                        <div style={character.style} key={index} ref={character.ref}>
                            <FoodAnimation
                                character={{ name: character.name }}
                                styles={{ maxWidth: "100%", maxHeight: "100%" }}
                                currentSpeakerName={currentSpeakerName}
                                isPaused={isPaused}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div >
    );
}

export default Forest;
