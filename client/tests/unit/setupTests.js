import '@testing-library/jest-dom';

// Mock CSS.supports if it doesn't exist (needed for JSDOM)
if (typeof CSS === 'undefined') {
    global.CSS = {};
}

if (!CSS.supports) {
    CSS.supports = (k, v) => false;
}

// Mock Canvas
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = () => {
        return {
            fillStyle: '',
            fillRect: () => { },
            // Add other methods if lottie complains
        };
    }
}

// Mock AudioContext
global.AudioContext = class {
    constructor() {
        this.state = 'running';
    }
    decodeAudioData(buffer) {
        return Promise.resolve(new ArrayBuffer(8)); // Mock buffer
    }
    suspend() {
        this.state = 'suspended';
        return Promise.resolve();
    }
    resume() {
        this.state = 'running';
        return Promise.resolve();
    }
};
global.webkitAudioContext = global.AudioContext;

// Mock MediaDevices
if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'mediaDevices', {
        value: {
            getUserMedia: () => Promise.resolve({
                getTracks: () => [{ stop: () => { } }]
            })
        }
    });
}

// Mock MediaRecorder
global.MediaRecorder = class {
    constructor(stream) { }
    start() { }
    stop() { }
};

// Mock RTCPeerConnection
global.RTCPeerConnection = class {
    constructor() { }
    createDataChannel() {
        return {
            addEventListener: () => { }
        };
    }
    createOffer() {
        return Promise.resolve({ sdp: 'mock-sdp' });
    }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    addTrack() { }
    close() { }
};
