import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { handle } from "./common.js";
import { createCollaboration } from "./collaboration.js";
const router = Router(),
  service = createCollaboration();
router.use(requireAuth);
router.patch(
  "/projects/:id/members/:userId",
  handle(async (req, res) => {
    await service.manage(
      req.user.id,
      req.params.id,
      req.params.userId,
      req.body,
    );
    res.status(204).end();
  }),
);
router.delete(
  "/projects/:id/members/:userId",
  handle(async (req, res) => {
    await service.remove(req.user.id, req.params.id, req.params.userId);
    res.status(204).end();
  }),
);
router.post(
  "/projects/:id/archive",
  handle(async (req, res) => {
    await service.archive(req.user.id, req.params.id);
    res.status(204).end();
  }),
);
router.post(
  "/tasks/:id/comments",
  handle(async (req, res) =>
    res
      .status(201)
      .json({
        comment: await service.comment(req.user.id, req.params.id, req.body),
      }),
  ),
);
router.get(
  "/tasks/:id/history",
  handle(async (req, res) =>
    res.json(await service.history(req.user.id, req.params.id)),
  ),
);
export default router;
