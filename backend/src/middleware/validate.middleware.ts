import { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

/**
 * Reusable middleware to validate incoming request data against a Zod schema.
 * Supports checking body, query, and params.
 *
 * @param schema The Zod schema to validate against.
 */
export const validate = (schema: ZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Parse and validate the request
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Assign parsed values back to the request object to ensure clean, type-cast data
      req.body = parsed.body;

      if (parsed.query !== undefined) {
        try {
          Object.defineProperty(req, "query", {
            value: parsed.query,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch (e) {
          for (const key of Object.keys(req.query)) {
            delete (req.query as any)[key];
          }
          Object.assign(req.query, parsed.query);
        }
      }

      if (parsed.params !== undefined) {
        try {
          Object.defineProperty(req, "params", {
            value: parsed.params,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch (e) {
          for (const key of Object.keys(req.params)) {
            delete (req.params as any)[key];
          }
          Object.assign(req.params, parsed.params);
        }
      }
      next();
    } catch (error: any) {
      if (error instanceof ZodError || (error && error.name === "ZodError")) {
        // Map Zod errors to a cleaner client-friendly array format
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

        next(new ApiError(400, "Validation failed", errorDetails));
      } else {
        next(error);
      }
    }
  };
};
