import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';
import '@/i18n';
import { applyZIndexCssVariables } from '@/zIndexLayers';

applyZIndexCssVariables();

// Mock .svg?react imports
vi.mock('@assets/icons', () => {
    return {
        Icons: new Proxy({}, {
            get: (target, prop) => {
                // Return a simple component for any icon access
                const MockIcon = (props: Record<string, unknown>) => React.createElement('svg', { 'data-testid': `icon-${String(prop)}`, ...props });
                return MockIcon;
            }
        })
    };
});

// Prevent lottie-web module load (starts a document-polling interval that races jsdom teardown).
vi.mock('react-lottie-player', async () => {
    const React = await import('react');
    const { vi } = await import('vitest');
    return {
        default: React.forwardRef((props: Record<string, unknown>, ref) => {
            React.useImperativeHandle(ref, () => ({
                play: vi.fn(),
                setDirection: vi.fn(),
                stop: vi.fn(),
            }));
            return React.createElement('div', { 'data-testid': 'lottie-player', ...props });
        }),
    };
});

// Mock CSS.supports if it doesn't exist (needed for JSDOM).
// The polyfills below are simplified test doubles, not real DOM implementations,
// so they can never structurally satisfy lib.dom's types — that's expected.
if (typeof CSS === 'undefined') {
    // @ts-expect-error - minimal test double, not a real CSS object
    global.CSS = {};
}

if (!CSS.supports) {
    // @ts-expect-error - minimal test double, not the real overloaded CSS.supports
    CSS.supports = (_k: string, _v: string) => false;
}

// Mock Canvas
if (typeof HTMLCanvasElement !== 'undefined') {
    // @ts-expect-error - minimal test double, not a real CanvasRenderingContext2D
    HTMLCanvasElement.prototype.getContext = () => {
        return {
            fillStyle: '',
            fillRect: () => { },
            // Add other methods if lottie complains
        };
    }
}

// Mock AudioContext
class MockAudioContext {
    state = 'running';
    decodeAudioData(_buffer: unknown) {
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
}
// @ts-expect-error - test double, not a real AudioContext
global.AudioContext = MockAudioContext;
// @ts-expect-error - webkitAudioContext isn't declared on globalThis
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
class MockMediaStream {
    _tracks: unknown[];
    constructor(tracks: unknown[] = []) {
        this._tracks = Array.isArray(tracks) ? [...tracks] : [];
    }
    getTracks() {
        return this._tracks;
    }
    addTrack(track: unknown) {
        this._tracks.push(track);
    }
}
// @ts-expect-error - test double, not a real MediaStream
global.MediaStream = MockMediaStream;

// Mock MediaRecorder
class MockMediaRecorder {
    constructor(_stream: unknown) { }
    start() { }
    stop() { }
}
// @ts-expect-error - test double, not a real MediaRecorder (no isTypeSupported)
global.MediaRecorder = MockMediaRecorder;

// Mock RTCPeerConnection
class MockRTCPeerConnection {
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
}
// @ts-expect-error - test double, not a real RTCPeerConnection (no generateCertificate)
global.RTCPeerConnection = MockRTCPeerConnection;
