import type { NextFunction, Request, Response } from "express";

/** Health checks and internal prototype static files — no caching. */
export const CACHE_CONTROL_NO_STORE = "no-store";

/**
 * Meeting, client key, and other API JSON — not cacheable at shared caches or browsers for long.
 * Audio route overwrites this on successful GET /api/audio/:id.
 */
export const CACHE_CONTROL_PRIVATE_NO_STORE = "private, no-store";

/** Vite `dist/assets/*` filenames are content-hashed; safe for long immutable caching. */
export const CACHE_CONTROL_DIST_ASSET_IMMUTABLE = "public, max-age=31536000, immutable";

/** SPA shell: `dist/index.html` must revalidate so deploys propagate. */
export const CACHE_CONTROL_HTML_SHELL = "no-cache";

/**
 * Copied from `client/public/` to `dist/` root (favicon, manifest, robots, og image).
 * Short TTL: no content hash, but safe to cache at the edge to reduce origin hits.
 */
export const CACHE_CONTROL_DIST_PUBLIC_ROOT = "public, max-age=86400";

/** Public replay clip JSON at a stable URL; bytes at id are immutable. */
export const CACHE_CONTROL_PUBLIC_AUDIO = "public, max-age=31536000, immutable";

export function cacheControlPrivateNoStoreApi(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("Cache-Control", CACHE_CONTROL_PRIVATE_NO_STORE);
    next();
}
