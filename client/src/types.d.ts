import type { CofBootstrap } from "@shared/AvailableLanguages";

export { };

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
        /** @deprecated Legacy Opera global; keep typed loosely for UA sniffing. */
        opera?: string;
        MSStream?: boolean;
        /** Injected by the server into the SPA shell (see server/src/utils/spaShell.ts). */
        __COF_BOOTSTRAP__?: CofBootstrap;
    }
}
