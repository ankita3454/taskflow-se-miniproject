import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectOwner } from "../middleware/permissions.js";
import {
  createInvitation,
  getReceivedInvitations,
  InvitationError,
  respondToInvitation,
} from "../services/invitationService.js";
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
      if (error instanceof InvitationError) {
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
  "/invitations",
  requireAuth,
  handle(async (req, res) => {
    const invitations = await getReceivedInvitations(req.user.id);
    res.status(200).json({ invitations });
  }),
);

router.post(
  "/projects/:projectId/invitations",
  requireAuth,
  requireProjectOwner(),
  handle(async (req, res) => {
    const invitation = await createInvitation(req.project.id, req.user.id, req.body);
    res.status(201).json({ invitation });
  }),
);

router.post(
  "/invitations/:invitationId/accept",
  requireAuth,
  handle(async (req, res) => {
    const invitation = await respondToInvitation(req.params.invitationId, req.user.id, "ACCEPTED");
    res.status(200).json({ invitation });
  }),
);

router.post(
  "/invitations/:invitationId/decline",
  requireAuth,
  handle(async (req, res) => {
    const invitation = await respondToInvitation(req.params.invitationId, req.user.id, "DECLINED");
    res.status(200).json({ invitation });
  }),
);

export default router;
