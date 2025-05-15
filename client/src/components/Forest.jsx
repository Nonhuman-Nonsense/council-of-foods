import React, { useState, useEffect, useRef } from "react";
import FoodAnimation from "./FoodAnimation.jsx";
import { dvh } from "../utils.js";

function Forest({ currentSpeakerName, isPaused }) {

    //Zooming variables
    const [zoomInOnBeing, setZoomInOnBeing] = useState(null);
    const containerRef = useRef(null);
    const [zoomInValue, setZoomInValue] = useState(1);
    const [offsetValue, setOffsetValue] = useState([0, 0]);
    const [translateValue, setTranslateValue] = useState([0, 0]);

    const characterRefs = {
        Beetle: useRef(null),
        Boletus: useRef(null),
        Butterfly: useRef(null),
        "Flaming Pine": useRef(null),
        "Flaming Pine2": useRef(null),
        "Flying Bird": useRef(null),
        Insect: useRef(null),
        Lichen: useRef(null),
        Log: useRef(null),
        Mosquito: useRef(null),
        Moth: useRef(null),
        Pine: useRef(null),
        "Reindeer House": useRef(null),
        Reindeer: useRef(null),
        Salmon: useRef(null),
        Saw: useRef(null),
        Saw2: useRef(null)
    };

    const container = {
        position: "absolute",
        backgroundColor: "black",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "-3",
        transform: `scale(${zoomInValue}) translate(${translateValue[0]}px, ${translateValue[1]}px)`,
        transformOrigin: `${offsetValue[0]}px ${offsetValue[1]}px`,
        transition: "transform 2s ease-out"
    };


    useEffect(() => {
        //find the current speaker in the list of characters
        console.log(currentSpeakerName);
        const found = characterRefs[currentSpeakerName];
        if (found) {
            setZoomInOnBeing(found);
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

    function l(sign, amount){
        //Position is from center, minus percentage of view height
        //capped at 300px view height, which is our minimum
        return `calc(50% ${sign} max(${amount + dvh}, ${300 * amount / 100}px)`;
    }

    return (
        <div style={container} ref={containerRef}>
            <div style={{zIndex: "-5", height: "80%", alignSelf: "flex-end", position: "relative", top: "12%"}}><FoodAnimation character={{ name: "River" }} isPaused={isPaused} /></div>
            <Being name="Pine" ref={characterRefs['Pine']} height="30%" left={l("+", 8)} bottom="16%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Salmon" ref={characterRefs['Salmon']} height="7%" left={l("+", 16)} bottom="10%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Boletus" ref={characterRefs['Boletus']} height="9%" left={l("+", 27)} bottom="6%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Log" ref={characterRefs['Log']} height="6%" left={l("-", 3)} bottom="33%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Birch" ref={characterRefs['Birch']} height="24%" left={l("-", 28)} bottom="26%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Beetle" ref={characterRefs['Beetle']} height="7%" left={l("-", 13)} bottom="31%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Reindeer" ref={characterRefs['Reindeer']} height="15%" left={l("-", 25)} bottom="51%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Flaming Pine" ref={characterRefs['Flaming Pine']} height="15%" left={l("-", 70)} bottom="20%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Reindeer House" ref={characterRefs['Reindeer House']} height="25%" left={l("-", 70)} bottom="60%" isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
            <Being name="Insect" ref={characterRefs['Insect']} height="5%" left={l("-", 35)} bottom="50%" isPaused={isPaused} currentSpeakerName={currentSpeakerName}/>
        </div >
    );
}

function Being({name, ref, height, left, bottom, isPaused, currentSpeakerName}){
    return (
        <div ref={ref} style={{position: "absolute", height: height, left: left, bottom: bottom}}>
            <FoodAnimation character={{ name: name }} isPaused={isPaused} currentSpeakerName={currentSpeakerName} />
        </div>
    );
}

export default Forest;
