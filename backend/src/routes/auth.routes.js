import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  registerUser,
  authenticateUser,
  getUserById,
  updateOwnProfile,
  AuthError,
} from "../services/authService.js";
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
      if (error instanceof AuthError) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      }
      console.error(error);
      return res.status(500).json({
        error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" },
      });
    }
  };
}

// POST /api/v1/auth/register — F1-REQ-01/02/03
router.post(
  "/register",
  handle(async (req, res) => {
    const { token, user } = await registerUser(req.body);
    res.status(201).json({ token, user });
  }),
);

// POST /api/v1/auth/login — F1-REQ-04/05
router.post(
  "/login",
  handle(async (req, res) => {
    const { token, user } = await authenticateUser(req.body);
    res.status(200).json({ token, user });
  }),
);

// POST /api/v1/auth/logout — F1-REQ-10
// JWTs are stateless, so "logout" is enforced client-side (discard the token).
// This endpoint exists so the client has a single, documented place to call;
// it always succeeds for any authenticated caller.
router.post(
  "/logout",
  requireAuth,
  handle(async (_req, res) => {
    res.status(204).send();
  }),
);

// GET /api/v1/auth/me — F1-REQ-06
router.get(
  "/me",
  requireAuth,
  handle(async (req, res) => {
    const user = await getUserById(req.user.id);
    res.status(200).json({ user });
  }),
);

// PATCH /api/v1/auth/me — F1-REQ-06
router.patch(
  "/me",
  requireAuth,
  handle(async (req, res) => {
    const user = await updateOwnProfile(req.user.id, req.body);
    res.status(200).json({ user });
  }),
);

export default router;
