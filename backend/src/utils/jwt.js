import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

if (!SECRET) {
  // Fail loudly at boot rather than silently signing with "undefined".
  throw new Error("JWT_SECRET is not set. Add it to your .env file.");
}

/**
 * Issues a signed JWT for an authenticated user.
 * Payload intentionally carries only id + role (SRS F1-REQ-04) — never the
 * password hash or any other sensitive field (SEC-05).
 */
export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, {
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Verifies a JWT and returns its payload, or throws if invalid/expired.
 */
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
