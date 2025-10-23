/**
 * Base Application Error
 *
 * All domain errors should extend this class for consistent error handling.
 */
export class AppError extends Error {
  public readonly name: string;
  public readonly isOperational: boolean;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      name?: string;
      isOperational?: boolean;
      statusCode?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);

    // Ensure the name of this error is the same as the class name
    this.name = options?.name || this.constructor.name;

    // Operational errors are expected errors (validation, business logic)
    // vs. programmer errors (bugs, unexpected failures)
    this.isOperational = options?.isOperational ?? true;

    this.statusCode = options?.statusCode;
    this.details = options?.details;

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Set cause if provided (for error chaining)
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Convert error to JSON for logging/persistence
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      isOperational: this.isOperational,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}
