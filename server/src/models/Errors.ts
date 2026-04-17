/** Thrown when no document exists for the requested meeting id (maps to HTTP 404). */
export class NotFoundError extends Error {
    override readonly name = "Not found";
    constructor(message?: string) {
        super(message || "Not found"); 
    }
}

/** Thrown when the user is not authorized to access the requested resource (maps to HTTP 401). */
export class UnauthorizedError extends Error {
    override readonly name = "Unauthorized";
    constructor(message?: string) {
        super(message || "Unauthorized");
    }
}

/** Thrown when the user is forbidden to access the requested resource (maps to HTTP 403). */
export class ForbiddenError extends Error {
    override readonly name = "Forbidden";
    constructor(message?: string) {
        super(message || "Forbidden");
    }
}

/** Thrown when the request is invalid (maps to HTTP 400). */
export class BadRequestError extends Error {
    override readonly name = "Bad request";
    constructor(message?: string) {
        super(message || "Bad request");
    }
}

/** Thrown when the request conflicts with the current server state (maps to HTTP 409). */
export class ConflictError extends Error {
    override readonly name = "Conflict";
    constructor(message?: string) {
        super(message || "Conflict");
    }
}

/** Thrown when an internal server error occurs (maps to HTTP 500). */
export class InternalServerError extends Error {
    override readonly name = "Internal server error";
    constructor(message?: string) {
        super(message || "Internal server error");
    }
}