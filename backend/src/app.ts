import express from "express";
import cors from "cors";
import router from "./routes/index";
import { errorHandler } from "./middleware/error.middleware";
import { ApiError } from "./utils/ApiError";

const app = express();

// Global Middlewares
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Health Check Endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});



// Versioned API Routes
app.use("/api/v1", router);

// Wildcard Catch-All Route for Unhandled Endpoints (here we get the error structured object)
app.use((req, _res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;