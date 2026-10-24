import { verifyToken } from "../utils/jwt.js";

/**
 * Requires a valid, unexpired JWT bearer token.
 * On success, attaches req.user = { id, role } (SRS F1-REQ-07).
 * On failure, responds 401 (SRS F1-REQ-08 / SEC-04) and does not call next().
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Missing or malformed bearer token" },
    });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid or expired token" },
    });
  }
}

/**
 * Requires req.user.role to be one of `roles`. Must run after requireAuth.
 * Responds 403 if the caller's role does not permit the action
 * (SRS F1-REQ-09 / F4-REQ-07 / F8-REQ-05 / SEC-02).
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Missing or malformed bearer token" },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Your role does not permit this action" },
      });
    }
    return next();
  };
}
