export { };

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
        /** @deprecated Legacy Opera global; keep typed loosely for UA sniffing. */
        opera?: string;
        MSStream?: boolean;
    }
}
