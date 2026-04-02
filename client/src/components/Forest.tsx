import { useState, useEffect, useRef, useMemo, createRef, CSSProperties, type RefObject } from "react";
import FoodAnimation from "./FoodAnimation.jsx";
import { dvh, minWindowHeight, filename, useMobile, useDocumentVisibility } from "../utils.js";
import forestCharacters from "../prompts/forest_characters.json";
import { forestCharacterRatios } from "../generated/forestCharacterRatios";

type ForestManifestEntry = (typeof forestCharacters)[number];

type ForestCharacter = ForestManifestEntry & {
    ratio: number;
    ref: RefObject<HTMLDivElement | HTMLImageElement | null>;
};

type ForestProps = {
    currentSpeakerId: string;
    isPaused: boolean;
    audioContext: RefObject<AudioContext | null>;
};

/** Build-time sync guarantees a ratio per manifest id; fail fast if manifest and generated file drift. */
function ratioFor(id: string): number {
    const r = forestCharacterRatios[id];
    if (r === undefined) {
        throw new Error(`Forest: missing forestCharacterRatios entry for id "${id}". Run prebuild / sync script.`);
    }
    return r;
}

function Forest({ currentSpeakerId, isPaused, audioContext }: ForestProps) {

    const isMobile = useMobile();

    //Zooming variables
    const [zoomInOnBeing, setZoomInOnBeing] = useState<ForestCharacter | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [zoomInValue, setZoomInValue] = useState(1);
    const [transformOrigin, setTransformOrigin] = useState<(string | number)[]>([0, 0]);
    const [translate, setTranslate] = useState<(string | number)[]>([0, 0]);
    const [animateTransformOrigin, setAnimateTransformOrigin] = useState(false);
    const [disableAnimations, setDisableAnimations] = useState(false);

    const characterRefs = useMemo(() => {
        const map: Record<string, RefObject<HTMLDivElement | HTMLImageElement | null>> = {};
        for (const c of forestCharacters) {
            map[c.id] = createRef<HTMLDivElement | HTMLImageElement>();
        }
        return map;
    }, []);

    const characters: ForestCharacter[] = useMemo(
        () =>
            forestCharacters.map((c) => ({
                ...c,
                ratio: ratioFor(c.id),
                ref: characterRefs[c.id],
            })),
        [characterRefs],
    );

    useEffect(() => {
        const handleResize = () => {
            setDisableAnimations(true);
        };
        window.addEventListener('resize', handleResize);
        // Cleanup function to remove the event listener
        return () => window.removeEventListener('resize', handleResize);
    }, []); // Empty dependency array ensures this effect runs only once on mount and unmount

    const container: CSSProperties = {
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
    }, [currentSpeakerId, characters]);

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
        if (containerRef.current) {
            const m = window.getComputedStyle(containerRef.current).transform;
            setAnimateTransformOrigin(m !== "none" && m !== "matrix(1, 0, 0, 1, 0, 0)");
        } else {
            setAnimateTransformOrigin(false);
        }
        setDisableAnimations(false);
    }, [zoomInOnBeing]);

    function l(amount) {
        //Position is from center, minus percentage of view height
        //capped at 300px view height, which is our minimum
        const sign = Math.sign(amount) === 1 ? "+" : "-";
        return `calc(50% ${sign} max(${Math.abs(amount) + dvh}, ${minWindowHeight * Math.abs(amount) / 100}px))`;
    }

    return (
        <div style={container} ref={containerRef}>
            <AmbientAudio audioContext={audioContext} />
            <img style={{ zIndex: "-5", height: "100%", position: "absolute", bottom: 0 }} src={`/backgrounds/forest${isMobile ? "-small" : ""}.avif`} alt="" />
            <div style={{ zIndex: "-4", height: "75.5%", position: "absolute", bottom: 0, left: "calc(50% - max(49dvh,147px))" }}>
                <FoodAnimation type="transparent" character={{ id: "river" }} isPaused={isPaused} always_on={true} styles={{}} currentSpeakerId={currentSpeakerId} />
                <BeingAudio id={'river'} volume={0.15} currentSpeakerId={currentSpeakerId} audioContext={audioContext} />
            </div>
            {characters.map((character) => (
                <div key={character.id}>
                    <Being
                        id={character.id}
                        type={character.type}
                        ref={character.ref}
                        height={character.height + "%"}
                        left={l(character.left)}
                        bottom={character.bottom + "%"}
                        always_on={character.always_on}
                        isPaused={isPaused}
                        currentSpeakerId={currentSpeakerId}
                    />
                    {character.audio && <BeingAudio id={character.id} volume={character.audio} currentSpeakerId={currentSpeakerId} audioContext={audioContext} />}
                </div>
            ))}
        </div >
    );
}

type BeingProps = {
    id: string;
    ref: RefObject<HTMLDivElement | HTMLImageElement | null>;
    type: ForestManifestEntry["type"];
    height: string;
    left: string;
    bottom: string;
    always_on?: boolean;
    isPaused: boolean;
    currentSpeakerId: string;
};

function Being({ id, ref, type, height, left, bottom, always_on, isPaused, currentSpeakerId }: BeingProps) {
    // One ref object is reused per character; only one of div / img mounts — narrow per branch for ref types.
    return (<>
        {type !== "image" &&
            <div ref={ref as RefObject<HTMLDivElement | null>} style={{ position: "absolute", height: height, left: left, bottom: bottom }}>
                <FoodAnimation type={type} character={{ id: id }} isPaused={isPaused} always_on={always_on} currentSpeakerId={currentSpeakerId} styles={{}} />
            </div>
        }
        {type === "image" && <img ref={ref as RefObject<HTMLImageElement | null>} style={{ position: "absolute", height: height, left: left, bottom: bottom }} src={`/characters/images/${filename(id)}.avif`} alt="" />}
    </>
    );
}

type BeingAudioProps = {
    id: string;
    currentSpeakerId: string;
    volume: number;
    audioContext: RefObject<AudioContext | null>;
};

function BeingAudio({ id, currentSpeakerId, volume, audioContext }: BeingAudioProps) {
    const gainNode = useRef(null); //The general volume control node
    const sourceNode = useRef(null);

    const [play, setPlay] = useState(false);

    useEffect(() => {
        if (id === currentSpeakerId) {
            setPlay(true);
        } else {
            setPlay(false);
        }
    }, [currentSpeakerId]);

    useEffect(() => {
        if (play) {
            gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
            gainNode.current.gain.linearRampToValueAtTime(volume, audioContext.current.currentTime + 2);
        } else {
            gainNode.current.gain.linearRampToValueAtTime(0, audioContext.current.currentTime + 2);
        }
    }, [play]);

    if (audioContext.current && gainNode.current === null) {
        gainNode.current = audioContext.current.createGain();
        gainNode.current.connect(audioContext.current.destination);
        sourceNode.current = audioContext.current.createBufferSource();

        loadBeingAudio();
    }

    async function loadBeingAudio() {

        const audioBuffer = await fetch(`/characters/audio/${id}.mp3`)
            .then(res => res.arrayBuffer())
            .then(ArrayBuffer => audioContext.current.decodeAudioData(ArrayBuffer));

        sourceNode.current.buffer = audioBuffer;
        sourceNode.current.loop = true;
        sourceNode.current.connect(gainNode.current);
        gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
        sourceNode.current.start();
    }

    return null;
}

type AmbientAudioProps = {
    audioContext: RefObject<AudioContext | null>;
};

function AmbientAudio({ audioContext }: AmbientAudioProps) {
    const gainNode = useRef(null); //The general volume control node
    const sourceNode = useRef(null);

    //Global ambience volume
    const onVolume = 0.05;

    const isDocumentVisible = useDocumentVisibility();

    //Fade out ambience on tab onfocus
    useEffect(() => {
        if (!isDocumentVisible) {
            gainNode.current.gain.linearRampToValueAtTime(0, audioContext.current.currentTime + 0.5);
        } else {
            gainNode.current.gain.linearRampToValueAtTime(onVolume, audioContext.current.currentTime + 5);
        }
    }, [isDocumentVisible]);

    if (audioContext.current && gainNode.current === null) {
        gainNode.current = audioContext.current.createGain();
        gainNode.current.connect(audioContext.current.destination);

        //Set ambience volume
        gainNode.current.gain.setValueAtTime(onVolume, audioContext.current.currentTime);


        sourceNode.current = audioContext.current.createBufferSource();
        loadAmbience();
    }

    async function loadAmbience() {
        const audioBuffer = await fetch(`/characters/ambience.mp3`)
            .then(res => res.arrayBuffer())
            .then(ArrayBuffer => audioContext.current.decodeAudioData(ArrayBuffer));

        sourceNode.current.buffer = audioBuffer;
        sourceNode.current.loop = true;
        sourceNode.current.connect(gainNode.current);
        gainNode.current.gain.setValueAtTime(0, audioContext.current.currentTime);
        gainNode.current.gain.linearRampToValueAtTime(onVolume, audioContext.current.currentTime + 5);
        sourceNode.current.start();
    }

    return null;
}

export default Forest;
