import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { handle } from "./common.js";
import { createSecurityService } from "./security.js";
const router = Router(),
  service = createSecurityService();
router.use(requireAuth, requireRole("ADMIN"));
router.get(
  "/users",
  handle(async (_req, res) => res.json({ users: await service.listUsers() })),
);
router.patch(
  "/users/:id",
  handle(async (req, res) =>
    res.json({
      user: await service.updateUser(req.user.id, req.params.id, req.body),
    }),
  ),
);
router.get(
  "/audit",
  handle(async (req, res) =>
    res.json({ entries: await service.audit(req.query) }),
  ),
);
export default router;
