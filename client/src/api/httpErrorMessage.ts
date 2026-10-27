import type { ClientErrorKey } from "@shared/SocketTypes";

export type HttpErrorBody = {
    /** The server's prose, or `fallback` when the body carried none. */
    message: string;
    /** Set when the server named the failure — the client prefers its own copy. */
    errorKey?: ClientErrorKey;
};

/**
 * Read a failed fetch's JSON error body when present; otherwise fall back to
 * `fallback` (rather than dumping raw HTML or a noisy payload into the UI).
 */
export async function httpErrorBody(res: Response, fallback: string): Promise<HttpErrorBody> {
    const text = await res.text();
    try {
        const body = JSON.parse(text) as { message?: unknown; errorKey?: unknown };
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        const errorKey = typeof body?.errorKey === "string" ? (body.errorKey as ClientErrorKey) : undefined;
        return { message: message.length > 0 ? message : fallback, errorKey };
    } catch {
        return { message: fallback };
    }
}

/** Message-only form, for callers with nowhere to put the key. */
export async function httpErrorMessage(res: Response, fallback: string): Promise<string> {
    return (await httpErrorBody(res, fallback)).message;
}
