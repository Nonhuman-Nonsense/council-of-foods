import '@testing-library/jest-dom';

// Mock CSS.supports if it doesn't exist (needed for JSDOM)
if (typeof CSS === 'undefined') {
    global.CSS = {};
}

if (!CSS.supports) {
    CSS.supports = (k, v) => false;
}
