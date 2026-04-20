type CouncilErrorOptions = {
    /** Safe to return in API JSON; wins over defaultClientMessage and internalMessage. */
    clientMessage?: string;
    /** Used when clientMessage is omitted (e.g. conflict wording). */
    defaultClientMessage?: string;
};

/** Base for domain errors that map to HTTP responses. */
export class CouncilError extends Error {
    readonly statusCode: number;
    readonly clientMessage: string;

    constructor(statusCode: number, internalMessage: string, options?: CouncilErrorOptions) {
        super(internalMessage);
        this.statusCode = statusCode;
        this.clientMessage =
            options?.clientMessage ?? options?.defaultClientMessage ?? internalMessage;
    }
}

/** Thrown when no document exists for the requested meeting id (maps to HTTP 404). */
export class NotFoundError extends CouncilError {
    override readonly name = "Meeting not found";
    constructor(clientMessage?: string) {
        super(404, "Meeting not found", clientMessage ? { clientMessage } : undefined);
    }
}

/** Thrown when the user is not authorized to access the requested resource (maps to HTTP 401). */
export class UnauthorizedError extends CouncilError {
    override readonly name = "Unauthorized";
    constructor(clientMessage?: string) {
        super(401, "Unauthorized", clientMessage ? { clientMessage } : undefined);
    }
}

/** Thrown when the user is forbidden to access the requested resource (maps to HTTP 403). */
export class ForbiddenError extends CouncilError {
    override readonly name = "Forbidden";
    constructor(clientMessage?: string) {
        super(403, "Forbidden", clientMessage ? { clientMessage } : undefined);
    }
}

/** Thrown when the request is invalid (maps to HTTP 400). */
export class BadRequestError extends CouncilError {
    override readonly name = "Bad request";
    constructor(clientMessage?: string) {
        super(400, "Bad request", clientMessage ? { clientMessage } : undefined);
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
        });
    }
}

/** Thrown when an internal server error occurs (maps to HTTP 500). */
export class InternalServerError extends CouncilError {
    override readonly name = "Internal server error";
    constructor(clientMessage?: string) {
        super(500, "Internal server error", clientMessage ? { clientMessage } : undefined);
    }
}
