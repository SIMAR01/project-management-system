import { Router } from "express";
import authRouter from "./auth.routes";
import projectRouter from "./project.routes";
import { protect } from "../middleware/auth.middleware";

const router = Router();

// Register auth routes under v1/auth
router.use("/auth", authRouter);

// Register project workspace routes under v1/projects
router.use("/projects", protect, projectRouter);

export default router;
