import { cyan, yellow, red, gray } from "colorette";
import { CouncilError } from "@models/Errors.js";
import { sendReport, type ReportOptions } from "./errorbot.js";

const CLIENT_TERMINAL_PREFIX = '[CLIENT TERMINAL]';
const PROCESS_EXIT_PREFIX = '[PROCESS EXIT]';

function withClientTerminalPrefix(message: string): string {
    if (message.includes(CLIENT_TERMINAL_PREFIX)) return message;
    return `${CLIENT_TERMINAL_PREFIX} ${message}`;
}

function formatCauseLine(cause: unknown): string {
    if (cause instanceof Error) {
        const code = (cause as { code?: string }).code;
        const detail = cause.stack || cause.message;
        return code ? `Caused by: ${detail} [${code}]` : `Caused by: ${detail}`;
    }

    if (cause && typeof cause === "object") {
        const node = cause as { code?: string; message?: string };
        const detail = node.code || node.message || JSON.stringify(cause);
        return `Caused by: ${detail}`;
    }

    return `Caused by: ${String(cause)}`;
}

function formatErrorDetails(error: unknown): string[] {
    if (error instanceof Error) {
        const lines: string[] = [];
        if (error.stack) {
            lines.push(error.stack);
        } else if (error.message) {
            lines.push(error.message);
        }

        if (error.cause !== undefined) {
            lines.push(formatCauseLine(error.cause));
        }

        return lines;
    }

    return [JSON.stringify(error, null, 2)];
}

export class Logger {

    private static formatContext(context: string): string {
        return `[${context}]`;
    }

    static info(context: string, message: string): void {
        console.log(`${cyan(this.formatContext(context))} ${message}`);
    }

    // Note: Console logging happens synchronously BEFORE waiting for async reporting.
    // This preserves the order of console output even if reporting takes time.
    static async warn(context: string, message: string, error?: unknown, opts?: ReportOptions): Promise<void> {
        console.warn(`${cyan(this.formatContext(context))} ${yellow(message)}`);

        if (error) {
            for (const line of formatErrorDetails(error)) {
                console.warn(gray(line));
            }
        }

        // Auto-report warning
        await sendReport({
            context,
            severity: opts?.severity ?? 'warning',
            message,
            error,
            clientImpact: opts?.clientImpact,
            source: opts?.source,
        });
    }

    // Note: Console logging happens synchronously BEFORE waiting for async reporting.
    // This preserves the order of console output even if reporting takes time.
    static async error(context: string, message: string, error?: unknown, opts?: ReportOptions): Promise<void> {
        // Log the primary message in red
        console.error(`${red(this.formatContext(context))} ${red(message)}`);

        if (error) {
            for (const line of formatErrorDetails(error)) {
                console.error(gray(line));
            }
        }

        // Auto-report error
        await sendReport({
            context,
            severity: opts?.severity ?? 'error',
            message,
            error,
            clientImpact: opts?.clientImpact,
            source: opts?.source,
        });
    }

    /**
     * Centralized helper to log an error and broadcast a 500 status to the client.
     * "Crash" implies sending a terminal error to the client.
     */
    static reportAndCrashClient(
        context: string,
        message: string,
        error: unknown,
        broadcaster?: { broadcastError: (error: CouncilError, context?: string) => void }
    ): void {
        const reportMessage = withClientTerminalPrefix(message);

        // Log it (which also reports to errorbot)
        void this.error(context, reportMessage, error, {
            severity: 'critical',
            clientImpact: 'terminal',
        });

        // Tell the client
        if (broadcaster) {
            broadcaster.broadcastError(CouncilError.fromUnexpected(error), context);
        }
    }
}

export { CLIENT_TERMINAL_PREFIX, PROCESS_EXIT_PREFIX };
