import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  requireProjectMember,
  requireTaskStatusChange,
} from "../middleware/permissions.js";
import {
  createTask,
  listProjectTasks,
  listAccessibleProjects,
  changeTaskStatus,
  TaskError,
} from "../services/taskService.js";

const router = Router();

// GET /api/v1/projects
// Lists only projects the authenticated user can access.
router.get(
  "/projects",
  requireAuth,
  handle(async (req, res) => {
    const projects = await listAccessibleProjects(req.user.id);
    res.status(200).json({ projects });
  }),
);

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof TaskError) {
        return res.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            ...(Object.keys(error.fields).length ? { fields: error.fields } : {}),
          },
        });
      }

      console.error(error);
      return res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    }
  };
}

// POST /api/v1/tasks
// projectId is supplied in the JSON body.
router.post(
  "/tasks",
  requireAuth,
  requireProjectMember(),
  handle(async (req, res) => {
    const task = await createTask({
  body: req.body,
  userId: req.user.id,
  projectAccess: req.projectAccess,
  idempotencyKey: req.get("Idempotency-Key"),
  });

    res.status(201).json({ task });
  }),
);

// GET /api/v1/projects/:projectId/tasks
router.get(
  "/projects/:projectId/tasks",
  requireAuth,
  requireProjectMember(),
  handle(async (req, res) => {
    const tasks = await listProjectTasks(req.project.id);
    res.status(200).json({ tasks });
  }),
);
// PATCH /api/v1/tasks/:taskId/status
// Only the task assignee or project Owner may change status.
router.patch(
  "/tasks/:taskId/status",
  requireAuth,
  requireTaskStatusChange(),
  handle(async (req, res) => {
    const task = await changeTaskStatus({
      taskId: req.params.taskId,
      status: req.body?.status,
    });

    res.status(200).json({ task });
  }),
);
export default router;
