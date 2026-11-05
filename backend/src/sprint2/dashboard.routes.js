import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { handle } from "./common.js";
import { createDashboard } from "./dashboard.js";
const router = Router(),
  service = createDashboard();
router.use(requireAuth);
router.get(
  "/dashboard/today",
  handle(async (req, res) =>
    res.json({ tasks: await service.today(req.user.id) }),
  ),
);
router.get(
  "/projects/:id/dashboard",
  handle(async (req, res) =>
    res.json(await service.project(req.user.id, req.params.id)),
  ),
);
router.put(
  "/projects/:id/sprint",
  handle(async (req, res) =>
    res.json({
      project: await service.configure(req.user.id, req.params.id, req.body),
    }),
  ),
);
router.get(
  "/projects/:id/tasks.csv",
  handle(async (req, res) =>
    res
      .type("text/csv")
      .set("Content-Disposition", 'attachment; filename="taskflow-tasks.csv"')
      .send(await service.csv(req.user.id, req.params.id)),
  ),
);
export default router;
