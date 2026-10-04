import type { Express, Request, Response } from "express";
import { publicVenues } from "@utils/venues.js";

/** `GET /api/venues`: ids and names for the staff page's venue picker. No addresses. */
export function registerVenueRoutes(app: Express): void {
    app.get("/api/venues", (_req: Request, res: Response) => {
        res.json({ venues: publicVenues() });
    });
}
