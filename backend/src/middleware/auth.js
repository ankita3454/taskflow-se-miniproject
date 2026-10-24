import prisma from "../repositories/prisma.js";
import { verifyToken } from "../utils/jwt.js";

const unauthenticated = (res, message) =>
  res.status(401).json({ error: { code: "UNAUTHENTICATED", message } });

/**
 * Requires a valid, unexpired JWT bearer token for an active user.
 * On success, attaches req.user = { id, role }.
 * On failure, responds 401 (SRS F1-REQ-08 / SEC-04) and does not call next().
 *
 * The role is read from the database on every request, not from the token,
 * so a role change takes effect immediately (F1-REQ-07) and a deactivated
 * user's existing tokens stop working at once (F8-REQ-02).
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return unauthenticated(res, "Missing or malformed bearer token");
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return unauthenticated(res, "Invalid or expired token");
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true },
    });
  } catch (error) {
    return next(error);
  }

  if (!user || !user.active) {
    return unauthenticated(res, "Session is no longer valid");
  }

  req.user = { id: user.id, role: user.role };
  return next();
}

/**
 * Requires req.user.role to be one of `roles` ("MEMBER", "OWNER", "ADMIN").
 * Must run after requireAuth. Responds 403 if the caller's system role does
 * not permit the action (SRS F1-REQ-09 / F8-REQ-05 / SEC-02).
 *
 * For anything about a specific project or task, use the checks in
 * ./permissions.js instead: a system role of OWNER does not make a user the
 * owner of any particular project.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return unauthenticated(res, "Missing or malformed bearer token");
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Your role does not permit this action" },
      });
    }
    return next();
  };
}
