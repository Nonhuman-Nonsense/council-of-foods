export { };

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
        opera: any;
        MSStream: any;
    }
}
