import React from 'react';
import { foodVideoUrlsForId } from "@assets/foods/foodVideos";

interface VideoPreloaderProps {
    foodIds: string[];
}

/**
 * VideoPreloader
 * 
 * Renders hidden video elements to force the browser to buffer video assets
 * before they are needed in the main Council view.
 * 
 * It mirrors the source logic of FoodAnimation.tsx to ensure the correct codec 
 * (HEVC vs VP9) is preloaded based on browser support.
 */
function VideoPreloader({ foodIds }: VideoPreloaderProps): React.ReactElement {
    return (
        <div style={{ display: 'none', width: 0, height: 0, overflow: 'hidden' }}>
            {foodIds.map((id) => {
                const urls = foodVideoUrlsForId(id);
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
        </div>
    );
}

export default VideoPreloader;
