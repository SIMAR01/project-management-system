import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler or middleware to automatically catch errors and pass them to the next handler.
 * Avoids the need for try-catch blocks inside controller actions.
 */
export const asyncHandler = (requestHandler: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => {
      console.log(err, ' ----err in asunc handler')
      next(err)
    });
  };
};
