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

    interface Navigator {
        /**
         * Whether media may start on its own. Firefox 112+ only — every other
         * engine leaves this undefined, so callers must feature-detect and fall
         * back to probing (see `@/audio/canAutoplay`).
         */
        getAutoplayPolicy?: (
            context: "mediaelement" | "audiocontext",
        ) => "allowed" | "allowed-muted" | "disallowed";
    }
}
