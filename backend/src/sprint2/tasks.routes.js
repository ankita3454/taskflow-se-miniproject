import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { handle } from "./common.js";
import { createTaskFeatures } from "./tasks.js";
const router = Router(),
  service = createTaskFeatures();
router.use(requireAuth);
router.get(
  "/projects/:id/task-query",
  handle(async (req, res) =>
    res.json({
      tasks: await service.query(req.user.id, req.params.id, req.query),
    }),
  ),
);
router.get(
  "/projects/:id/tags",
  handle(async (req, res) =>
    res.json({ tags: await service.tags(req.user.id, req.params.id) }),
  ),
);
router.post(
  "/projects/:id/tags",
  handle(async (req, res) =>
    res
      .status(201)
      .json({
        tag: await service.createTag(req.user.id, req.params.id, req.body),
      }),
  ),
);
router.put(
  "/tasks/:id/tags/:tagId",
  handle(async (req, res) => {
    await service.applyTag(req.user.id, req.params.id, req.params.tagId);
    res.status(204).end();
  }),
);
router.delete(
  "/tasks/:id/tags/:tagId",
  handle(async (req, res) => {
    await service.applyTag(req.user.id, req.params.id, req.params.tagId, true);
    res.status(204).end();
  }),
);
router.post(
  "/tasks/:id/dependencies",
  handle(async (req, res) =>
    res
      .status(201)
      .json({
        dependency: await service.dependency(
          req.user.id,
          req.params.id,
          req.body,
        ),
      }),
  ),
);
router.delete(
  "/tasks/:id",
  handle(async (req, res) => {
    await service.delete(req.user.id, req.params.id);
    res.status(204).end();
  }),
);
export default router;
