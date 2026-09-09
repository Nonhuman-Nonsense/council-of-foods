import { ZodError } from "zod";
import type { ApiErrorBody, ClientErrorDebug, ClientErrorKey, ErrorPayload } from "@shared/SocketTypes.js";
import { config } from "../config.js";

type CouncilErrorOptions = {
    /** Safe to return in API JSON; wins over defaultClientMessage and internalMessage. */
    clientMessage?: string;
    /** Used when clientMessage is omitted (e.g. conflict wording). */
    defaultClientMessage?: string;
    /** Underlying error serialized into `debug` for internal clients (prototype / development). */
    debugCause?: unknown;
    /** Names the failure for the client's own copy; defaults per error class. */
    errorKey?: ClientErrorKey;
};

/** Options a caller may override on a class that has its own defaults. */
type CouncilErrorOverrides = Pick<CouncilErrorOptions, "debugCause" | "errorKey">;

/** How loudly an error should be logged: 'info' never reaches ErrorBot, 'warning'/'error' do. */
export type CouncilErrorSeverity = 'info' | 'warning' | 'error';

const VERBOSE_CLIENT_ERROR_ENVIRONMENTS = new Set(["prototype", "development"]);

function isVerboseClientErrors(): boolean {
    return VERBOSE_CLIENT_ERROR_ENVIRONMENTS.has(config.NODE_ENV);
}

function serializeErrorForClient(error: unknown): Omit<ClientErrorDebug, "context"> {
    if (error instanceof ZodError) {
        return {
            name: error.name,
            stack: error.stack,
            zodIssues: error.issues,
        };
    }
    if (error instanceof Error) {
        return {
            name: error.name,
            stack: error.stack,
            cause: (error as Error & { cause?: unknown }).cause,
        };
    }
    return { raw: error };
}

function buildDebug(statusCode: number, error?: unknown, context?: string): ClientErrorDebug | undefined {
    if (!isVerboseClientErrors() || (statusCode !== 400 && statusCode !== 500) || error == null) {
        return undefined;
    }
    return {
        ...serializeErrorForClient(error),
        ...(context ? { context } : {}),
    };
}

/** Base for domain errors that map to HTTP responses. */
export class CouncilError extends Error {
    readonly statusCode: number;
    readonly clientMessage: string;
    /**
     * What went wrong, as a name rather than a sentence. `clientMessage` stays
     * the fallback — for a client that doesn't know this key yet, and for
     * everything that reads the API without a translation table.
     */
    readonly errorKey: ClientErrorKey;
    readonly debugCause?: unknown;
    /** Log severity for this error class; expected/routine errors override to 'info'. */
    readonly severity: CouncilErrorSeverity = 'warning';

    constructor(statusCode: number, internalMessage: string, options?: CouncilErrorOptions) {
        super(internalMessage);
        this.statusCode = statusCode;
        this.clientMessage =
            options?.clientMessage ?? options?.defaultClientMessage ?? internalMessage;
        this.errorKey = options?.errorKey ?? "unexpected";
        this.debugCause = options?.debugCause;
    }

    toErrorPayload(context?: string): ErrorPayload {
        const debug = buildDebug(this.statusCode, this.debugCause, context);
        return debug
            ? { message: this.clientMessage, code: this.statusCode, errorKey: this.errorKey, debug }
            : { message: this.clientMessage, code: this.statusCode, errorKey: this.errorKey };
    }

    toApiBody(context?: string): ApiErrorBody {
        const debug = buildDebug(this.statusCode, this.debugCause, context);
        return debug
            ? { message: this.clientMessage, errorKey: this.errorKey, debug }
            : { message: this.clientMessage, errorKey: this.errorKey };
    }

    static fromZod(error: ZodError, clientMessage?: string): BadRequestError {
        return new BadRequestError(clientMessage, { debugCause: error });
    }

    static fromUnexpected(
        error: unknown,
        clientMessage?: string,
        errorKey?: ClientErrorKey,
    ): InternalServerError {
        return new InternalServerError(clientMessage, { debugCause: error, errorKey });
    }
}

/** Thrown when no document exists for the requested meeting id (maps to HTTP 404). */
export class NotFoundError extends CouncilError {
    override readonly name = "Meeting not found";
    /**
     * Temporarily kept at 'warning' (reports to ErrorBot) instead of 'info' so we can watch
     * volume/patterns of stale meeting links for a while — drop back to 'info' once that's understood.
     */
    override readonly severity: CouncilErrorSeverity = 'warning';
    constructor(clientMessage?: string) {
        super(404, "Meeting not found", { clientMessage, errorKey: "notFound" });
    }
}

/** Thrown when the user is not authorized to access the requested resource (maps to HTTP 401). */
export class UnauthorizedError extends CouncilError {
    override readonly name = "Unauthorized";
    constructor(clientMessage?: string) {
        super(401, "Unauthorized", { clientMessage, errorKey: "unauthorized" });
    }
}

/** Thrown when the user is forbidden to access the requested resource (maps to HTTP 403). */
export class ForbiddenError extends CouncilError {
    override readonly name = "Forbidden";
    constructor(clientMessage?: string) {
        super(403, "Forbidden", { clientMessage, errorKey: "forbidden" });
    }
}

/** Thrown when the request is invalid (maps to HTTP 400). */
export class BadRequestError extends CouncilError {
    static readonly clientErrorMessage = "Invalid request";

    override readonly name = "Bad request";
    constructor(clientMessage?: string, options?: CouncilErrorOverrides) {
        super(400, "Bad request", {
            clientMessage,
            defaultClientMessage: BadRequestError.clientErrorMessage,
            debugCause: options?.debugCause,
            errorKey: options?.errorKey ?? "invalidRequest",
        });
    }
}

/** Thrown when the request conflicts with the current server state (maps to HTTP 409). */
export class ConflictError extends CouncilError {
    static readonly statusCode = 409;
    /** Default client copy when a second client tries to take a live session (HTTP + sockets). */
    static readonly clientErrorMessage = "This meeting is happening somewhere else";

    override readonly name = "Conflict";
    constructor(clientMessage?: string) {
        super(ConflictError.statusCode, "Conflict", {
            clientMessage,
            defaultClientMessage: ConflictError.clientErrorMessage,
            errorKey: "elsewhere",
        });
    }
}

/**
 * Thrown when the account's provider capacity is exhausted — every retry lost
 * the same race (maps to HTTP 503).
 *
 * Not a fault, so it says so: the visitor is told the council is busy and that
 * coming back shortly will work, rather than being shown a server error they
 * can do nothing about.
 */
export class CapacityError extends CouncilError {
    static readonly clientErrorMessage =
        "Too many people are talking to the council right now. Please try again in a few minutes.";

    override readonly name = "Over capacity";
    /** Expected under load — worth watching, not the harder 500-level alert. */
    override readonly severity: CouncilErrorSeverity = 'warning';
    constructor(clientMessage?: string) {
        super(503, "Over capacity", {
            clientMessage,
            defaultClientMessage: CapacityError.clientErrorMessage,
            errorKey: "busy",
        });
    }
}

/** Thrown when an internal server error occurs (maps to HTTP 500). */
export class InternalServerError extends CouncilError {
    override readonly name = "Internal server error";
    /** Genuinely unexpected — worth the harder alert level, unlike routine 4xx CouncilErrors. */
    override readonly severity: CouncilErrorSeverity = 'error';
    constructor(clientMessage?: string, options?: CouncilErrorOverrides) {
        super(500, "Internal Server Error", {
            clientMessage,
            defaultClientMessage: "Internal Server Error",
            debugCause: options?.debugCause,
            errorKey: options?.errorKey ?? "unexpected",
        });
    }
}
