import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sendReport, type ErrorReport } from "@utils/errorbot.js";

export const ClientReportBody = z.object({
    message: z.string().min(1).max(2000),
    source: z.string().min(1).max(200),
    meetingId: z.number().int().positive().optional(),
    url: z.string().max(500).optional(),
    cause: z.unknown().optional(),
    severity: z.enum(['warning', 'error', 'critical']).optional(),
    clientImpact: z.enum(['none', 'notified', 'terminal', 'process_exit']).optional(),
});

export type ClientReportInput = z.infer<typeof ClientReportBody>;

/** Builds the errorbot report for a validated client report body, applying defaults. */
export function buildClientErrorReport(input: ClientReportInput): ErrorReport {
    const { message, source, meetingId, url, cause, severity, clientImpact } = input;
    const context = meetingId != null ? "client" : `client ${source}`;
    const detail = url ? `${message} (${url})` : message;

    return {
        context,
        severity: severity ?? 'critical',
        message: `[CLIENT TERMINAL] ${detail}`,
        error: cause,
        clientImpact: clientImpact ?? 'terminal',
        source: 'client',
        meetingId,
    };
}

/**
 * Ingest for client-side terminal failures (ErrorBoundary crashes, fatal socket/API
 * errors, window.onerror/unhandledrejection) — relays them to the errorbot.
 */
export function registerClientReportRoutes(app: Express): void {
    app.post('/api/client-report', async (req: Request, res: Response) => {
        const parsed = ClientReportBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid client report' });
            return;
        }

        res.status(204).end();

        await sendReport(buildClientErrorReport(parsed.data));
    });
}
