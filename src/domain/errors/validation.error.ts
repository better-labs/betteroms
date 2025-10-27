import { AppError } from './base.error';
import { ZodError } from 'zod';

/**
 * Validation Error
 *
 * Thrown when input data fails schema validation.
 * Includes detailed field-level error information.
 */
export class ValidationError extends AppError {
  public readonly validationErrors: ValidationIssue[];

  constructor(
    message: string,
    validationErrors: ValidationIssue[],
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, {
      name: 'ValidationError',
      isOperational: true,
      statusCode: 400,
      details: {
        ...options?.details,
        validationErrors,
      },
      cause: options?.cause,
    });

    this.validationErrors = validationErrors;
  }

  /**
   * Create ValidationError from Zod error
   */
  static fromZodError(zodError: ZodError, contextMessage?: string): ValidationError {
    const issues = zodError.issues.map((issue) => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code,
    }));

    const message = contextMessage || 'Invalid trade plan structure';

    return new ValidationError(message, issues, {
      cause: zodError,
    });
  }

  /**
   * Get human-readable error summary
   */
  getSummary(): string {
    const errorList = this.validationErrors
      .map((err) => `  - ${err.field}: ${err.message}`)
      .join('\n');

    return `${this.message}\n\nValidation errors:\n${errorList}`;
  }

  /**
   * Override toJSON to include validation errors
   */
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}
