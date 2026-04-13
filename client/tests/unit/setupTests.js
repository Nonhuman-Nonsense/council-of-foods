import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';
import '../../src/i18n';

// Mock .svg?react imports
// Mock .svg?react imports
vi.mock('../../src/assets/icons/index', () => {
    return {
        Icons: new Proxy({}, {
            get: (target, prop) => {
                // Return a simple component for any icon access
                const MockIcon = (props) => React.createElement('svg', { 'data-testid': `icon-${String(prop)}`, ...props });
                return MockIcon;
            }
        })
    };
});

// Mock CSS.supports if it doesn't exist (needed for JSDOM)
if (typeof CSS === 'undefined') {
    global.CSS = {};
}

if (!CSS.supports) {
    CSS.supports = (_k, _v) => false;
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
    decodeAudioData(_buffer) {
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

// Mock MediaStream (jsdom has no WebRTC stream constructor; tests use `new MediaStream()`)
global.MediaStream = class MediaStream {
    constructor(tracks = []) {
        this._tracks = Array.isArray(tracks) ? [...tracks] : [];
    }
    getTracks() {
        return this._tracks;
    }
    addTrack(track) {
        this._tracks.push(track);
    }
};

// Mock MediaRecorder
global.MediaRecorder = class {
    constructor(_stream) { }
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
