import { describe, it, expect, beforeEach } from "vitest";
import {
    clearLiveSessionRegistryForTests,
    hasLiveSession,
    releaseLiveSession,
    socketHoldsLiveSession,
    tryAcquireLiveSession,
} from "@logic/liveSessionRegistry.js";

describe("liveSessionRegistry", () => {
    beforeEach(() => {
        clearLiveSessionRegistryForTests();
    });

    it("allows first acquire per meeting", () => {
        expect(tryAcquireLiveSession(1, "sock-a", "key-a")).toBe(true);
    });

    it("blocks second socket for same meeting", () => {
        tryAcquireLiveSession(1, "sock-a", "key-a");
        expect(tryAcquireLiveSession(1, "sock-b", "key-a")).toBe(false);
    });

    it("allows same socket to re-acquire", () => {
        tryAcquireLiveSession(1, "sock-a", "key-a");
        expect(tryAcquireLiveSession(1, "sock-a", "key-a")).toBe(true);
    });

    it("releaseLiveSession clears only matching socket", () => {
        tryAcquireLiveSession(1, "sock-a", "key-a");
        releaseLiveSession(1, "sock-b");
        expect(tryAcquireLiveSession(1, "sock-b", "key-b")).toBe(false);
        releaseLiveSession(1, "sock-a");
        expect(tryAcquireLiveSession(1, "sock-b", "key-b")).toBe(true);
    });

    it("socketHoldsLiveSession is true only for the registered socket", () => {
        tryAcquireLiveSession(9, "sock-a", "k");
        expect(socketHoldsLiveSession(9, "sock-a")).toBe(true);
        expect(socketHoldsLiveSession(9, "sock-b")).toBe(false);
        expect(socketHoldsLiveSession(99, "sock-a")).toBe(false);
    });

    it("hasLiveSession reflects current lock state for any socket", () => {
        expect(hasLiveSession(42)).toBe(false);
        tryAcquireLiveSession(42, "sock-a", "k");
        expect(hasLiveSession(42)).toBe(true);
        releaseLiveSession(42, "sock-a");
        expect(hasLiveSession(42)).toBe(false);
    });
});
