import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  requireProjectMember,
  requireTaskStatusChange,
  requireTaskProjectOwner,
} from "../middleware/permissions.js";
import {
  createTask,
  assignTask,
  listProjectMembers,
  listProjectTasks,
  changeTaskStatus,
  updateTask,
  TaskError,
} from "../services/taskService.js";

const router = Router();

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
            ...(Object.keys(error.fields).length
              ? { fields: error.fields }
              : {}),
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
      userId: req.user.id,
    });

    res.status(200).json({ task });
  }),
);

/**
 * PATCH /api/v1/tasks/:taskId
 * Only the Project Owner can edit task details.
 * Completed tasks cannot be edited.
 */
router.patch(
  "/tasks/:taskId",
  requireAuth,
  requireTaskProjectOwner(),
  handle(async (req, res) => {
    const task = await updateTask({
      taskId: req.task.id,
      body: req.body,
      userId: req.user.id,
    });

    res.status(200).json({ task });
  }),
);

router.get(
  "/projects/:projectId/members",
  requireAuth,
  requireProjectMember(),
  handle(async (req, res) => {
    const members = await listProjectMembers(req.project.id);
    res.status(200).json({ members });
  }),
);

router.patch(
  "/tasks/:taskId/assignee",
  requireAuth,
  requireTaskProjectOwner(),
  handle(async (req, res) => {
    const task = await assignTask({ taskId: req.task.id, body: req.body, userId: req.user.id });
    res.status(200).json({ task });
  }),
);

export default router;