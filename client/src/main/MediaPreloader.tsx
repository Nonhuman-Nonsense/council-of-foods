import React from 'react';
import { useMobile } from "@/utils";
import {
    characterAudioSources,
    characterTransparentVideoUrls,
} from "@assets/characters/characterData";

interface MediaPreloaderProps {
    foodIds: string[];
}

/**
 * MediaPreloader
 * 
 * Renders hidden video and audio elements to force the browser to buffer character
 * media before it is needed in the main Council view.
 * 
 * It mirrors the source logic of FoodAnimation.tsx to ensure the correct codec 
 * (HEVC vs VP9) is preloaded based on browser support. Audio comes from
 * `characterAudioSources`, which is empty in projects that ship no character loops.
 */
function MediaPreloader({ foodIds }: MediaPreloaderProps): React.ReactElement {
    const isMobile = useMobile();
    return (
        <div style={{ display: 'none', width: 0, height: 0, overflow: 'hidden' }}>
            {foodIds.map((id) => {
                const urls = characterTransparentVideoUrls(id, isMobile);
                return (
                    <video
                        key={id}
                        preload="auto"
                        muted
                        playsInline
                        width="0"
                        height="0"
                    >
                        <source
                            src={urls.hevc}
                            type={'video/mp4; codecs="hvc1"'} />
                        <source
                            src={urls.vp9}
                            type={"video/webm"} />
                    </video>
                );
            })}
            {foodIds.map((id) => {
                const sources = characterAudioSources(id);
                if (sources.length === 0) return null;
                return (
                    <audio key={id} preload="auto" muted>
                        {sources.map((source) => (
                            <source key={source.src} src={source.src} type={source.type} />
                        ))}
                    </audio>
                );
            })}
        </div>
    );
}

export default MediaPreloader;
