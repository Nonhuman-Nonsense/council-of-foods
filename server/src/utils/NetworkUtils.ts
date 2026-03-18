import { Logger } from "@utils/Logger.js";

const DEFAULT_RETRIES = 3;

/**
 * Wrapper for network calls to handle specific low-level network errors
 * that might not be automatically retried by SDKs or fetch (e.g. 'terminated', 'ECONNRESET').
 */
export const withNetworkRetry = async <T>(fn: () => Promise<T>, context: string = "NetworkUtils", retries = DEFAULT_RETRIES): Promise<T> => {
    try {
        return await fn();
    } catch (error: unknown) {
        // Cast to an object to safely access message/code properties
        const err = error as { message?: string; code?: string | number };

        const isNetworkError =
            err.message === 'terminated' ||
            err.code === 'UND_ERR_SOCKET' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ETIMEDOUT';

        if (retries > 0 && isNetworkError) {
            Logger.warn(context, `Retrying operation due to network error: ${err.message || err.code} (attempt ${4 - retries}/3)`);
            await new Promise(res => setTimeout(res, 1000));
            return withNetworkRetry(fn, context, retries - 1);
        }
        throw error;
    }
};
