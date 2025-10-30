import { useState, useEffect, useRef } from "react";
import FoodAnimation from "./FoodAnimation.jsx";
import { dvh, minWindowHeight, filename, useMobile } from "../utils.js";

function Forest({ currentSpeakerId, isPaused }) {

    const isMobile = useMobile();

    //Zooming variables
    const [zoomInOnBeing, setZoomInOnBeing] = useState(null);
    const containerRef = useRef(null);
    const [zoomInValue, setZoomInValue] = useState(1);
    const [transformOrigin, setTransformOrigin] = useState([0, 0]);
    const [translate, setTranslate] = useState([0, 0]);
    const [animateTransformOrigin, setAnimateTransformOrigin] = useState(false);
    const [disableAnimations, setDisableAnimations] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setDisableAnimations(true);
        };
        window.addEventListener('resize', handleResize);
        // Cleanup function to remove the event listener
        return () => window.removeEventListener('resize', handleResize);
    }, []); // Empty dependency array ensures this effect runs only once on mount and unmount

    const characters = [//Ratio is video width / height
        { ref: useRef(null), id: "salmon", type: "transparent", zoom: 60, height: 9, left: 2.5, bottom: 42.5, ratio: 934 / 450 },
        { ref: useRef(null), id: "bird", type: "transparent", height: 14, left: 12.5, bottom: 52, ratio: 708 / 612 },
        { ref: useRef(null), id: "bumblebee", type: "transparent", zoom: 60, height: 10, left: -48, bottom: 44, ratio: 786 / 646 },
        { ref: useRef(null), id: "concortapine", type: "image", height: 27, left: -73, bottom: 13, ratio: 724 / 918 },
        { ref: useRef(null), id: "pine", type: "transparent", zoom: 100, height: 61, left: 26, bottom: 0, ratio: 1104 / 1920 },
        { ref: useRef(null), id: "reindeer", type: "transparent", height: 16, left: -26.5, bottom: 27, ratio: 1040 / 956 },
        { ref: useRef(null), id: "windturbine", type: "transparent", height: 22, left: 1, bottom: 69.5, ratio: 1066 / 946 },
        { ref: useRef(null), id: "treeharvester", type: "transparent", zoom: 80, height: 19, left: 57.5, bottom: 1, ratio: 674 / 900 },
        { ref: useRef(null), id: "kota", type: "transparent", always_on: true, height: 35, left: 54, bottom: 20, ratio: 574 / 1000 },
        { ref: useRef(null), id: "lichen", type: "transparent", height: 25, left: 40, bottom: 53.5, ratio: 1332 / 1000 },
        { ref: useRef(null), id: "burningpine", type: "transparent", always_on: true, height: 14, left: -88, bottom: 85.5, ratio: 474 / 474 },
        { ref: useRef(null), id: "aurora", type: "transparent", always_on: true, height: 21, left: -35, bottom: 80, ratio: 1600 / 800 },
        { ref: useRef(null), id: "mountain", type: "transparent", zoom: 40, height: 16, left: -52, bottom: 71.5, ratio: 1600 / 480 },
        { ref: useRef(null), id: "kota2", type: "image", height: 11, left: -19.5, bottom: 64, ratio: 564 / 400 },
        { ref: useRef(null), id: "snowyspruce", type: "image", height: 36, left: -37, bottom: 44.5, ratio: 1044 / 1800 },
    ];

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
        transform: `scale(${zoomInValue}) translate(${translate[0]}, ${translate[1]})`,
        transformOrigin: `${transformOrigin[0]} ${transformOrigin[1]}`,
        transition: !disableAnimations && `transform 2s ease-out, transform-origin ${animateTransformOrigin ? "2s" : "0.0001s"} ease-out`
    };


    useEffect(() => {
        //find the current speaker in the list of characters
        const found = characters.find((char) => char.id === currentSpeakerId);
        if (found) {
            setZoomInOnBeing(found);
        } else {
            setZoomInOnBeing(null);
        }
    }, [currentSpeakerId]);

    useEffect(() => {
        if (zoomInOnBeing) {
            //Zoom in so that character is 70% of height, or custom
            const zoom = (zoomInOnBeing.zoom ?? 70) / zoomInOnBeing.height;

            //Pixel calculations would be
            // const container = containerRef.current.getBoundingClientRect();
            // const screenHeight = container.height;
            // const screenWidth = container.width;
            // const box = zoomInOnBeing.ref.current.getBoundingClientRect();
            // const left = box.left + (box.right - box.left) / 2;
            // const top = box.top + (box.bottom - box.top) / 2;
            // const translateLeft = (screenWidth / 2 - left) / zoom;
            // const translateTop = (screenHeight / 2 - top) / zoom;

            //Which when calculated into dvh and vw values gives
            const left = zoomInOnBeing.left + ((zoomInOnBeing.height * zoomInOnBeing.ratio) / 2); //dvh offset from 50vw
            const top = 100 - zoomInOnBeing.bottom - zoomInOnBeing.height / 2; //dvh
            const translateLeft = -(zoomInOnBeing.left + zoomInOnBeing.height * zoomInOnBeing.ratio / 2) / zoom; //dvh
            const translateTop = (-50 + zoomInOnBeing.bottom + zoomInOnBeing.height / 2) / zoom; //dvh

            //Cap everything at the minimum zoom
            const sign = Math.sign(zoomInOnBeing.left) === 1 ? "+" : "-"; //left or right side of middle
            const cappedLeft = `calc(50vw ${sign} max(${Math.abs(left) + dvh}, ${minWindowHeight * Math.abs(left) / 100}px))`;//Left value needs calc
            const cappedTop = `max(${top + dvh}, ${top * minWindowHeight / 100 + "px"})`;
            const minOrMax = Math.sign(zoomInOnBeing.left) === 1 ? "min" : "max"; //left or right side of middle
            const cappedTranslateLeft = `${minOrMax}(${translateLeft + dvh}, ${translateLeft * minWindowHeight / 100 + "px"})`;
            const minOrMax2 = top > 50 ? "min" : "max"; //top or bottom half of screen
            const cappedTranslateTop = `${minOrMax2}(${translateTop + dvh}, ${translateTop * minWindowHeight / 100 + "px"})`;

            setZoomInValue(zoom);
            setTransformOrigin([cappedLeft, cappedTop]);
            setTranslate([cappedTranslateLeft, cappedTranslateTop]);
        } else {//Zoom out
            setZoomInValue(1);
            setTranslate([0, 0]);
        }
        //If we are zooming in from an actual zoom out state, don't animate the change of transform origin.
        if (window.getComputedStyle(containerRef.current).transform === "matrix(1, 0, 0, 1, 0, 0)") {
            setAnimateTransformOrigin(false);
        } else {
            setAnimateTransformOrigin(true);
        }
        setDisableAnimations(false);
    }, [zoomInOnBeing]);

    function l(amount) {
        //Position is from center, minus percentage of view height
        //capped at 300px view height, which is our minimum
        const sign = Math.sign(amount) === 1 ? "+" : "-";
        return `calc(50% ${sign} max(${Math.abs(amount) + dvh}, ${minWindowHeight * Math.abs(amount) / 100}px)`;
    }

    return (
        <div style={container} ref={containerRef}>
            <img style={{ zIndex: "-5", height: "100%", position: "absolute", bottom: 0 }} src={`/backgrounds/forest${isMobile ? "-small" : ""}.avif`} alt="" />
            <div style={{ zIndex: "-4", height: "75.5%", position: "absolute", bottom: 0, left: "calc(50% - max(49dvh,147px))" }}>
                <FoodAnimation type="transparent" character={{ id: "river" }} isPaused={isPaused} always_on={true} />
            </div>
            {characters.map((character, index) => (
                <Being
                    key={index}
                    id={character.id}
                    type={character.type}
                    ref={character.ref}
                    height={character.height + "%"}
                    left={l(character.left)}
                    bottom={character.bottom + "%"}
                    always_on={character.always_on}
                    isPaused={isPaused}
                    currentSpeakerId={currentSpeakerId}
                />))}
        </div >
    );
}

function Being({ id, ref, type, height, left, bottom, always_on, isPaused, currentSpeakerId }) {
    return (<>
        {type !== "image" &&
            <div ref={ref} style={{ position: "absolute", height: height, left: left, bottom: bottom }}>
                <FoodAnimation type={type} character={{ id: id }} isPaused={isPaused} always_on={always_on} currentSpeakerId={currentSpeakerId} />
            </div>
        }
        {type === "image" && <img style={{ position: "absolute", height: height, left: left, bottom: bottom}} src={`/characters/images/${filename(id)}.avif`} alt="" />}
    </>
    );
}

export default Forest;
