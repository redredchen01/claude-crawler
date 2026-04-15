export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", 400, message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", 404, `${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Unauthorized") {
    super("UNAUTHORIZED", 403, message);
    this.name = "AuthorizationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
    this.name = "ConflictError";
  }
}

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      status: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      status: 500,
      message: error.message,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Unknown error occurred",
  };
}
