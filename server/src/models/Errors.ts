/** Thrown when no document exists for the requested meeting id (maps to HTTP 404). */
export class NotFoundError extends Error {
    override readonly name = "NotFoundError";
    constructor() {
        super("Not found"); 
    }
}

/** Thrown when the user is not authorized to access the requested resource (maps to HTTP 401). */
export class UnauthorizedError extends Error {
    override readonly name = "UnauthorizedError";
    constructor() {
        super("Unauthorized");
    }
}

/** Thrown when the user is forbidden to access the requested resource (maps to HTTP 403). */
export class ForbiddenError extends Error {
    override readonly name = "ForbiddenError";
    constructor() {
        super("Forbidden");
    }
}

/** Thrown when the request is invalid (maps to HTTP 400). */
export class BadRequestError extends Error {
    override readonly name = "BadRequestError";
    constructor() {
        super("Bad request");
    }
}