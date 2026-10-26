import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  requireProjectMember,
  requireTaskProjectOwner,
} from "../middleware/permissions.js";
import {
  assignTask,
  createTask,
  listProjectMembers,
  listProjectTasks,
  listAccessibleProjects,
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
    const task = await assignTask({ taskId: req.task.id, body: req.body });
    res.status(200).json({ task });
  }),
);

export default router;
