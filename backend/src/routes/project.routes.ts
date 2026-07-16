import { Router } from "express";
import { ProjectController } from "../controllers/project.controller";
import { checkMembership, requireRole } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate.middleware";
import { idempotencyMiddleware } from "../middleware/idempotency.middleware";
import {
  createProjectSchema,
  updateProjectSchema,
  inviteMemberSchema,
  removeMemberSchema,
} from "../validations/project.validation";

const router = Router();

// Global listing & creation
router.get("/", ProjectController.list);
router.get("/created", ProjectController.listCreated);
router.post("/", idempotencyMiddleware, validate(createProjectSchema), ProjectController.create);

// Project specific reads (accessible to any workspace member)
router.get("/:projectId", checkMembership, ProjectController.getDetails);
router.get("/:projectId/activity", checkMembership, ProjectController.getTimeline);

// Project mutations (restricted to ProjectManager role)
router.put(
  "/:projectId",
  checkMembership,
  requireRole(["ProjectManager"]),
  idempotencyMiddleware,
  validate(updateProjectSchema),
  ProjectController.update
);

router.delete(
  "/:projectId",
  checkMembership,
  requireRole(["ProjectManager"]),
  idempotencyMiddleware,
  ProjectController.delete
);

router.post(
  "/:projectId/archive",
  checkMembership,
  requireRole(["ProjectManager"]),
  idempotencyMiddleware,
  ProjectController.archive
);

router.post(
  "/:projectId/invite",
  checkMembership,
  requireRole(["ProjectManager"]),
  idempotencyMiddleware,
  validate(inviteMemberSchema),
  ProjectController.invite
);

router.post(
  "/:projectId/remove",
  checkMembership,
  requireRole(["ProjectManager"]),
  idempotencyMiddleware,
  validate(removeMemberSchema),
  ProjectController.remove
);

export default router;
