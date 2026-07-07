import { cyan, yellow, red, gray } from "colorette";
import { CouncilError } from "@models/Errors.js";
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { ProvidesReportContext, ReportContext } from "@interfaces/ReportContext.js";
import { resolveReportContext } from "@interfaces/ReportContext.js";
import { sendReport, type ClientImpact, type ReportSeverity, type ReportSource } from "./errorbot.js";

const CLIENT_TERMINAL_PREFIX = '[CLIENT TERMINAL]';
const PROCESS_EXIT_PREFIX = '[PROCESS EXIT]';

export type LogDetails = {
    error?: unknown;
    from?: ProvidesReportContext | ReportContext;
    severity?: ReportSeverity;
    clientImpact?: ClientImpact;
    source?: ReportSource;
    broadcaster?: IMeetingBroadcaster;
};

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
    static async warn(context: string, message: string, details?: LogDetails): Promise<void> {
        console.warn(`${cyan(this.formatContext(context))} ${yellow(message)}`);

        if (details?.error) {
            for (const line of formatErrorDetails(details.error)) {
                console.warn(gray(line));
            }
        }

        await sendReport(this.buildReport(context, message, details, 'warning'));
    }

    // Note: Console logging happens synchronously BEFORE waiting for async reporting.
    // This preserves the order of console output even if reporting takes time.
    static async error(context: string, message: string, details?: LogDetails): Promise<void> {
        console.error(`${red(this.formatContext(context))} ${red(message)}`);

        if (details?.error) {
            for (const line of formatErrorDetails(details.error)) {
                console.error(gray(line));
            }
        }

        await sendReport(this.buildReport(context, message, details, 'error'));
    }

    /**
     * Centralized helper to log an error and broadcast a 500 status to the client.
     * "Crash" implies sending a terminal error to the client.
     */
    static reportAndCrashClient(
        context: string,
        message: string,
        details: LogDetails & { error: unknown },
    ): void {
        const reportMessage = withClientTerminalPrefix(message);
        const { broadcaster, error } = details;

        void this.error(context, reportMessage, {
            ...details,
            error,
            severity: 'critical',
            clientImpact: 'terminal',
        });

        if (broadcaster) {
            broadcaster.broadcastError(CouncilError.fromUnexpected(error), context);
        }
    }

    private static buildReport(
        context: string,
        message: string,
        details: LogDetails | undefined,
        defaultSeverity: ReportSeverity,
    ) {
        const { meetingId, socketId } = resolveReportContext(details?.from);

        return {
            context,
            severity: details?.severity ?? defaultSeverity,
            message,
            error: details?.error,
            clientImpact: details?.clientImpact,
            source: details?.source,
            meetingId,
            socketId,
        };
    }
}

export { CLIENT_TERMINAL_PREFIX, PROCESS_EXIT_PREFIX };
