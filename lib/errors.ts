/**
 * Typed error hierarchy for Machina
 *
 * Maps errors to HTTP status codes and provides actionable messages.
 */

/**
 * Base error class for all Machina errors
 */
export class MachinaError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "MachinaError";
  }
}

/**
 * Permission denied - requires macOS permissions to be granted
 */
export class PermissionError extends MachinaError {
  constructor(app: string) {
    super(
      `Permission denied for ${app}. Grant automation access:\n` +
        `System Settings → Privacy & Security → Automation → Enable ${app}`,
      "PERMISSION_DENIED",
      403
    );
    this.name = "PermissionError";
  }
}

/**
 * Operation timed out
 */
export class TimeoutError extends MachinaError {
  constructor(operation: string, timeoutSec: number) {
    super(
      `${operation} timed out after ${timeoutSec}s.\n` +
        `This may indicate:\n` +
        `  • A permission dialog is waiting for your response\n` +
        `  • The operation is taking too long (try with fewer items)\n` +
        `  • The app is unresponsive`,
      "TIMEOUT",
      504
    );
    this.name = "TimeoutError";
  }
}

/**
 * Validation error - bad input parameters
 */
export class ValidationError extends MachinaError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

/**
 * Resource not found
 */
export class NotFoundError extends MachinaError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/**
 * Database access error
 */
export class DatabaseError extends MachinaError {
  constructor(database: string, message: string) {
    super(`${database} database error: ${message}`, "DATABASE_ERROR", 500);
    this.name = "DatabaseError";
  }
}

/**
 * Service unavailable (e.g., WhatsApp not connected)
 */
export class ServiceUnavailableError extends MachinaError {
  constructor(service: string, reason: string) {
    super(`${service} is unavailable: ${reason}`, "SERVICE_UNAVAILABLE", 503);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Unknown operation requested
 */
export class UnknownOperationError extends MachinaError {
  constructor(operation: string, available: string[]) {
    super(
      `Unknown operation: ${operation}\n\nAvailable operations: ${available.join(", ")}`,
      "UNKNOWN_OPERATION",
      400
    );
    this.name = "UnknownOperationError";
  }
}
