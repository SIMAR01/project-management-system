import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import { protect } from "../middleware/auth.middleware";
import { registerSchema, loginSchema } from "../validations/auth.validation";

const router = Router();

// Public routes
router.post("/signup", validate(registerSchema), AuthController.register);
router.post("/login", validate(loginSchema), AuthController.login);
router.post("/refresh-token", AuthController.refreshToken);

// Private routes (protected by authentication middleware)
router.post("/logout", protect, AuthController.logout);
router.get("/profile", protect, AuthController.me);
router.get("/sessions", protect, AuthController.getSessions);

export default router;
