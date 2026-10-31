import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createProject,
  getProjectsForMember,
  ProjectError,
} from "../services/projectService.js";
import { ValidationError } from "../utils/validation.js";

const router = Router();

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: error.message, fields: error.details },
        });
      }
      if (error instanceof ProjectError) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      }
      console.error(error);
      return res.status(500).json({
        error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" },
      });
    }
  };
}

router.get(
  "/",
  requireAuth,
  handle(async (req, res) => {
    const projects = await getProjectsForMember(req.user.id);
    res.status(200).json({ projects });
  }),
);

router.post(
  "/",
  requireAuth,
  handle(async (req, res) => {
    const project = await createProject(req.user.id, req.body);
    res.status(201).json({ project });
  }),
);

export default router;
