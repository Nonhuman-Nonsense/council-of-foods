import { config } from '@root/src/config.js';
import { cyan, yellow, red } from "colorette";

// Avoid circular dependency by not importing Logger here.
// Instead, we use console directly for internal logging of the errorbot itself.

export type ReportSeverity = 'warning' | 'error' | 'critical';
export type ClientImpact = 'none' | 'notified' | 'terminal' | 'process_exit';
export type ReportSource = 'server' | 'client';

/** Raw request params/query for tracing which arguments produced a given API failure. */
export type RequestParams = {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
};

export type ErrorReport = {
    context: string;
    severity: ReportSeverity;
    message: string;
    error?: unknown;
    clientImpact?: ClientImpact;
    source?: ReportSource;
    meetingId?: number;
    socketId?: string;
    requestParams?: RequestParams;
};

//We wrap this in a function to make sure that it runs after .env is loaded
export function initReporting(): void {
    if (config.COUNCIL_ERRORBOT) {
        console.log(`${cyan("[init]")} Will attempt to post errors to errorbot on ${config.COUNCIL_ERRORBOT}`);
    } else {
        console.warn(`${cyan("[init]")} ${yellow("COUNCIL_ERRORBOT not set, will not report errors.")}`);
    }
}

// Helper to reliably serialize Error objects
function serializeError(err: unknown): unknown {
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
export async function sendReport(report: ErrorReport): Promise<void> {

    if (!config.COUNCIL_ERRORBOT) {
        return;
    }

    const payload = {
        service: config.COUNCIL_DB_PREFIX,
        severity: report.severity,
        clientImpact: report.clientImpact ?? 'none',
        source: report.source ?? 'server',
        context: report.context,
        message: report.message,
        time: new Date().toISOString(),
        error: serializeError(report.error),
        meetingId: report.meetingId,
        socketId: report.socketId,
        requestParams: report.requestParams,
    };

    const sendStr = JSON.stringify(payload);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (config.COUNCIL_ERRORBOT_KEY) {
        headers['X-Errorbot-Key'] = config.COUNCIL_ERRORBOT_KEY;
    }

    await fetch(config.COUNCIL_ERRORBOT, {
        method: 'POST',
        body: sendStr,
        headers
    }).catch(error => {
        console.error(`${red("[reportError]")} Failed to post to errorbot:`, error);
    });
}

process.on('uncaughtException', async (err) => {
    console.error(`${red("[process]")} Uncaught Exception`, err);
    await sendReport({
        context: 'process',
        severity: 'critical',
        message: '[PROCESS EXIT] Uncaught Exception',
        error: err,
        clientImpact: 'process_exit',
    });
    process.exit(1);
});
