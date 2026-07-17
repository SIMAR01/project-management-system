import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import { protect } from "../middleware/auth.middleware";
import { registerSchema, loginSchema } from "../validations/auth.validation";
import { authRateLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

// Public routes (protected by brute-force rate limiter)
router.post("/signup", authRateLimiter, validate(registerSchema), AuthController.register);
router.post("/login", authRateLimiter, validate(loginSchema), AuthController.login);
router.post("/refresh-token", AuthController.refreshToken);

// Private routes (protected by authentication middleware)
router.post("/logout", protect, AuthController.logout);
router.get("/profile", protect, AuthController.me);
router.get("/sessions", protect, AuthController.getSessions);

export default router;
