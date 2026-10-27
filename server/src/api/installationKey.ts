import type { NextFunction, Request, Response } from "express";
import { config } from "@root/src/config.js";
import { keyMatches } from "@utils/sharedKey.js";

/**
 * An installation's devices — the bridge on the museum Mac and the room power plugs — call
 * `/api/installation/*` with one shared key, COUNCIL_INSTALLATION_KEY. Staff paste it into
 * `#staff` (which hands it to the bridge) and into each plug's script. With it a device can
 * list venues (addresses masked), email a listed venue's own staff, and report room power:
 * never choose an address.
 */

export const INSTALLATION_KEY_HEADER = "x-installation-key";

export function requireInstallationKey(req: Request, res: Response, next: NextFunction): void {
    const expected = config.COUNCIL_INSTALLATION_KEY;
    if (!expected) {
        res.status(503).json({ message: "COUNCIL_INSTALLATION_KEY is not set on this server" });
        return;
    }
    if (!keyMatches(req.get(INSTALLATION_KEY_HEADER), expected)) {
        res.status(401).json({ message: "Invalid installation key" });
        return;
    }
    next();
}
