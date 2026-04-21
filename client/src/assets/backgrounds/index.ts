import zoomedOut from "./zoomed-out.webp";
import zoomedIn from "./zoomed-in.webp";
import closeUpBackdrop from "./close-up-backdrop.webp";
import closeUpTable from "./close-up-table.webp";

/** Vite-resolved URLs (content-hashed in production → long cache via `/assets/`). */
export const backgroundImageUrls = {
    zoomedOut,
    zoomedIn,
    closeUpBackdrop,
    closeUpTable,
} as const;
