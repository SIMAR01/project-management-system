import { Router } from "express";
import authRouter from "./auth.routes";

const router = Router();

// Register auth routes under v1/auth
router.use("/auth", authRouter);

export default router;
