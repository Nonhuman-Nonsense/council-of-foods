import type { Express, Request, Response } from "express";
import { z } from "zod";
import { config } from "@root/src/config.js";
import { sendReport, type ErrorReport } from "@utils/errorbot.js";

const TEST_ERRORBOT_SCENARIOS = {
    warning: {
        context: 'dev test / socket validation',
        severity: 'warning',
        message: 'Validation error for submit_human_message (400)',
        clientImpact: 'notified',
        source: 'server',
    },
    error: {
        context: 'api GET /api/meetings/1',
        severity: 'error',
        message: 'GET /api/meetings/1 failed, internal server error',
        error: new Error('Simulated API failure'),
        clientImpact: 'none',
        source: 'server',
    },
    critical_terminal: {
        context: 'AudioSystem',
        severity: 'critical',
        message: '[CLIENT TERMINAL] Error generating audio',
        error: new Error('Simulated TTS failure'),
        clientImpact: 'terminal',
        source: 'server',
    },
    client_terminal: {
        context: 'client meeting 42',
        severity: 'critical',
        message: '[CLIENT TERMINAL] Simulated client crash (http://localhost:4173/en/meeting/42)',
        error: new Error('Simulated client-side failure'),
        clientImpact: 'terminal',
        source: 'client',
    },
    process_exit: {
        context: 'process',
        severity: 'critical',
        message: '[PROCESS EXIT] Simulated uncaught exception',
        error: new Error('Simulated process crash'),
        clientImpact: 'process_exit',
        source: 'server',
    },
} as const satisfies Record<string, ErrorReport>;

export type ErrorbotTestScenario = keyof typeof TEST_ERRORBOT_SCENARIOS;

const SCENARIO_IDS = Object.keys(TEST_ERRORBOT_SCENARIOS) as [
    ErrorbotTestScenario,
    ...ErrorbotTestScenario[],
];

const TestErrorbotQuery = z.object({
    scenario: z.enum([...SCENARIO_IDS, 'all']).default('critical_terminal'),
});

export function listTestErrorbotScenarios(): ErrorbotTestScenario[] {
    return [...SCENARIO_IDS];
}

export async function sendTestErrorbotReport(scenario: ErrorbotTestScenario): Promise<ErrorReport> {
    const report = TEST_ERRORBOT_SCENARIOS[scenario];
    await sendReport(report);
    return report;
}

export async function sendAllTestErrorbotReports(): Promise<ErrorbotTestScenario[]> {
    const scenarios = listTestErrorbotScenarios();
    for (const scenario of scenarios) {
        await sendTestErrorbotReport(scenario);
    }
    return scenarios;
}

async function handleTestErrorbot(req: Request, res: Response): Promise<void> {
    if (!config.COUNCIL_ERRORBOT) {
        res.status(503).json({
            ok: false,
            message: 'COUNCIL_ERRORBOT is not configured',
            scenarios: listTestErrorbotScenarios(),
        });
        return;
    }

    const scenarioInput =
        typeof req.query.scenario === 'string'
            ? req.query.scenario
            : typeof req.body?.scenario === 'string'
                ? req.body.scenario
                : undefined;

    const parsed = TestErrorbotQuery.safeParse({ scenario: scenarioInput });
    if (!parsed.success) {
        res.status(400).json({
            ok: false,
            message: 'Invalid scenario',
            scenarios: [...listTestErrorbotScenarios(), 'all'],
        });
        return;
    }

    const { scenario } = parsed.data;
    if (scenario === 'all') {
        const sent = await sendAllTestErrorbotReports();
        res.status(200).json({ ok: true, sent, target: config.COUNCIL_ERRORBOT });
        return;
    }

    const report = await sendTestErrorbotReport(scenario);
    res.status(200).json({ ok: true, scenario, report, target: config.COUNCIL_ERRORBOT });
}

/** Dev-only routes for exercising Errorbot ingest + Telegram formatting. */
export function registerDevErrorbotRoutes(app: Express, environment: string): void {
    if (environment !== "development") {
        return;
    }

    app.get('/api/dev/test-errorbot', (req, res) => {
        void handleTestErrorbot(req, res);
    });
    app.post('/api/dev/test-errorbot', (req, res) => {
        void handleTestErrorbot(req, res);
    });
}
