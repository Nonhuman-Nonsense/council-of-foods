import { cyan, yellow, red, gray } from "colorette";
import { sendReport } from "./errorbot.js";

export class Logger {

    private static formatContext(context: string): string {
        return `[${context}]`;
    }

    static info(context: string, message: string): void {
        console.log(`${cyan(this.formatContext(context))} ${message}`);
    }

    // Note: Console logging happens synchronously BEFORE waiting for async reporting.
    // This preserves the order of console output even if reporting takes time.
    static async warn(context: string, message: string, error?: unknown): Promise<void> {
        console.warn(`${cyan(this.formatContext(context))} ${yellow(message)}`);

        // Log error details if provided
        if (error) {
            if (error instanceof Error) {
                console.warn(gray(error.stack || error.message));
            } else {
                console.warn(gray(JSON.stringify(error, null, 2)));
            }
        }

        // Auto-report warning
        await sendReport(context, "WARNING", message, error);
    }

    // Note: Console logging happens synchronously BEFORE waiting for async reporting.
    // This preserves the order of console output even if reporting takes time.
    static async error(context: string, message: string, error?: unknown): Promise<void> {
        // Log the primary message in red
        console.error(`${red(this.formatContext(context))} ${red(message)}`);

        // Log error details if provided
        if (error) {
            if (error instanceof Error) {
                console.error(gray(error.stack || error.message));
            } else {
                console.error(gray(JSON.stringify(error, null, 2)));
            }
        }

        // Auto-report error
        await sendReport(context, "ERROR", message, error);
    }

    /**
     * Centralized helper to log an error and broadcast a 500 status to the client.
     * "Crash" implies sending a terminal error to the client.
     */
    static reportAndCrashClient(context: string, message: string, error: unknown, broadcaster?: { broadcastError: (msg: string, code: number) => void }): void {
        // Log it (which also reports to errorbot)
        this.error(context, message, error);

        // Tell the client
        if (broadcaster) {
            // Decouple the specific error details from the client message if desired, 
            // or pass the generic message. For now, we use the message provided.
            broadcaster.broadcastError(message, 500);
        }
    }
}
