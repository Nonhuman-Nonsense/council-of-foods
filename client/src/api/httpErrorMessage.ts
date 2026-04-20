/**
 * Read a JSON `{ message: string }` body from a failed fetch response when present;
 * otherwise return `fallback` (avoids dumping raw HTML or noisy payloads to the UI).
 */
export async function httpErrorMessage(res: Response, fallback: string): Promise<string> {
    const text = await res.text();
    try {
        const body = JSON.parse(text) as unknown;
        if (
            body &&
            typeof body === "object" &&
            "message" in body &&
            typeof (body as { message: unknown }).message === "string"
        ) {
            const m = (body as { message: string }).message.trim();
            if (m.length > 0) {
                return m;
            }
        }
    } catch {
        /* not JSON */
    }
    return fallback;
}
