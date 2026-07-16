/**
 * Custom error class to handle operational errors in the application.
 */
export class ApiError extends Error {
  public statusCode: number;
  public errors: any[];
  public isOperational: boolean;
  public success: boolean;

  constructor(
    statusCode: number,
    message: string = "Something went wrong",
    errors: any[] = [],
    stack: string = ""
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;
    this.isOperational = true; // Indicates this is an operational error, not a programmer bug

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this.classConstructor, this.constructor);
    }
  }

  // Helper getter to reference constructor for captureStackTrace
  private get classConstructor(): Function {
    return this.constructor;
  }
}
