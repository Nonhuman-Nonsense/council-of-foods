//We wrap this in a function to make sure that it runs after .env is loaded
//We wrap this in a function to make sure that it runs after .env is loaded
export function initReporting(): void {
    if (process.env.COUNCIL_ERRORBOT) {
        Logger.info("init", `Will attempt to post errors to errorbot on ${process.env.COUNCIL_ERRORBOT}`);
    } else {
        Logger.warn("init", `COUNCIL_ERRORBOT not set, will not report errors.`);
    }
}

import { Logger } from "./Logger.js";

// Helper to reliably serialize Error objects
function serializeError(err: any): any {
    if (err instanceof Error) {
        return {
            ...err, // validation errors might have extra props
            // Flatten error properties while ensuring name/message/stack are preserved if spread doesn't catch them
            // (Note: standard Error properties are not enumerable, so spread doesn't include them usually!)
            name: err.name,
            message: err.message,
            stack: err.stack,
            cause: (err as any).cause,
        };
    }
    return err;
}

export async function reportError(context: string, message: string, err?: any): Promise<void> {
    // 1. Log locally first
    Logger.error(context, message, err);

    // 2. Report if configured
    if (!process.env.COUNCIL_ERRORBOT) {
        Logger.warn("init", "COUNCIL_ERRORBOT not set, will not report error externally.");
        return;
    }

    const payload = {
        service: process.env.COUNCIL_DB_PREFIX || "CouncilOfFoods", // Default if not set
        level: "ERROR",
        context: context,
        message: message,
        time: new Date().toISOString(),
        error: serializeError(err)
    };

    const sendStr = JSON.stringify(payload);

    await fetch(process.env.COUNCIL_ERRORBOT, {
        method: 'POST',
        body: sendStr,
        headers: { 'Content-Type': 'application/json' }
    }).catch(error => {
        // Log failure to report to bot, but don't crash process here just because bot failed (unless critical)
        console.error("Failed to post to errorbot:");
        console.error(error);
    });
}

//For all unrecoverable errors, post the message to error bot, and then crash
//For all unrecoverable errors, post the message to error bot, and then crash
process.on('uncaughtException', async (err) => {
    console.error(err);
    await reportError("process", "Uncaught Exception", err);
    console.log('[Shutdown] Uncaught Exception');
    process.exit(1);
});