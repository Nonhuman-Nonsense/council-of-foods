import { config } from '@root/src/config.js';
import { cyan, yellow, red, gray } from "colorette";

// Avoid circular dependency by not importing Logger here.
// Instead, we use console directly for internal logging of the errorbot itself.

//We wrap this in a function to make sure that it runs after .env is loaded
export function initReporting(): void {
    if (config.COUNCIL_ERRORBOT) {
        console.log(`${cyan("[init]")} Will attempt to post errors to errorbot on ${config.COUNCIL_ERRORBOT}`);
    } else {
        console.warn(`${cyan("[init]")} ${yellow("COUNCIL_ERRORBOT not set, will not report errors.")}`);
    }
}

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
            cause: (err as Error & { cause?: unknown }).cause,
        };
    }
    return err;
}

/**
 * Sends a report to the configured external error service.
 * Designed to be called by Logger.ts.
 */
export async function sendReport(context: string, level: string, message: string, err?: unknown): Promise<void> {

    // 2. Don't send if not configured
    if (!config.COUNCIL_ERRORBOT) {
        // Reduced verbosity here to avoid log spam loops if Logger calls this
        // console.warn(`${cyan("[config]")} ${yellow("COUNCIL_ERRORBOT not set, will not report to external error service.")}`);
        return;
    }

    const payload = {
        service: config.COUNCIL_DB_PREFIX,
        level: level,
        context: context,
        message: message,
        time: new Date().toISOString(),
        error: serializeError(err)
    };

    const sendStr = JSON.stringify(payload);

    await fetch(config.COUNCIL_ERRORBOT, {
        method: 'POST',
        body: sendStr,
        headers: { 'Content-Type': 'application/json' }
    }).catch(error => {
        console.error(`${red("[reportError]")} Failed to post to errorbot:`, error);
    });
}

//For all unrecoverable errors, post the message to error bot, and then crash
process.on('uncaughtException', async (err) => {
    // Log locally
    console.error(`${red("[process]")} Uncaught Exception`, err);
    // Send report
    await sendReport("process", "ERROR", "Uncaught Exception", err);
    process.exit(1);
});