import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
    return createHash("sha256").update(value).digest();
}

/**
 * Whether a key sent by a device (bridge, smart plug) is the configured one. Hashing first
 * gives equal-length buffers, so the comparison leaks nothing about the key's length.
 */
export function keyMatches(provided: string | undefined, expected: string): boolean {
    return timingSafeEqual(digest(provided ?? ""), digest(expected));
}
