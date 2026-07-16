import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError";

/**
 * Global Express error handling middleware.
 * Formats all operational and internal errors into a standardized response payload.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // If the error is not a custom ApiError instance, convert it
  if (!(error instanceof ApiError)) {
    let statusCode = error.statusCode || 500;
    let message = error.message || "Internal Server Error";

    // Handle Mongoose duplicate key error (e.g. unique username/email constraint)
    if (error.code === 11000) {
      statusCode = 409;
      const field = Object.keys(error.keyValue || {})[0] || "field";
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
      error = new ApiError(statusCode, message);
    }
    // Handle Mongoose CastError (e.g. invalid ObjectID)
    else if (error instanceof mongoose.Error.CastError) {
      statusCode = 400;
      message = `Invalid ${error.path}: ${error.value}`;
      error = new ApiError(statusCode, message);
    }
    // Handle Mongoose ValidationError
    else if (error instanceof mongoose.Error.ValidationError || (error && error.name === "ValidationError")) {
      statusCode = 400;
      const errors = error.errors || {};
      const errorDetails = Object.values(errors).map((val: any) => ({
        field: val.path,
        message: val.message,
      }));
      message = "Validation failed";
      error = new ApiError(statusCode, message, errorDetails);
    }
    // Handle Zod ValidationError (as fallback)
    else if (error && (error.name === "ZodError" || error.constructor?.name === "ZodError")) {
      statusCode = 400;
      const issues = error.errors || error.issues || [];
      const errorDetails = issues.map((err: any) => {
        const path = ["body", "query", "params"].includes(String(err.path[0]))
          ? err.path.slice(1)
          : err.path;
        return {
          field: path.join("."),
          message: err.message,
        };
      });
      message = "Validation failed";
      error = new ApiError(statusCode, message, errorDetails);
    }
    // Handle standard JSON parsing error
    else if (err instanceof SyntaxError && "status" in err && "body" in err) {
      statusCode = 400;
      message = "Malformed JSON payload";
      error = new ApiError(statusCode, message);
    }
    // Default fallback error
    else {
      message = process.env.NODE_ENV === "production" ? "Something went wrong" : message;
      error = new ApiError(statusCode, message, [], err.stack);
    }
  }

  // Format standard response payload
  const responsePayload = {
    success: false,
    message: error.message,
    errors: error.errors || [],
    stack: process.env.NODE_ENV === "development" ? error.stack : null,
  };

  res.status(error.statusCode).json(responsePayload);
};
