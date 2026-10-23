import bcrypt from "bcryptjs";
import prisma from "../repositories/prisma.js";
import { signToken } from "../utils/jwt.js";

const BCRYPT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * F1-REQ-01/02/03: register a new user with a unique e-mail and a bcrypt-hashed
 * password; never persists the plaintext password.
 */
export async function registerUser({ name, email, password }) {
  if (!name || !email || !password) {
    throw new AuthError(400, "VALIDATION_ERROR", "name, email and password are required");
  }
  if (password.length < 8) {
    throw new AuthError(400, "VALIDATION_ERROR", "Password must be at least 8 characters");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // F1-REQ-02: generic error, never reveals which field is wrong beyond "e-mail already in use".
    throw new AuthError(409, "EMAIL_IN_USE", "E-mail already in use");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

/**
 * F1-REQ-04/05: authenticate by e-mail + password; issues a JWT on success.
 * On failure, returns the SAME generic error whether the e-mail doesn't exist
 * or the password is wrong, so a caller can't enumerate valid accounts.
 */
export async function authenticateUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = () =>
    new AuthError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");

  if (!user || !user.active) {
    throw genericError();
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw genericError();
  }

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

/** F1-REQ-06: fetch the caller's own profile. */
export async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AuthError(404, "NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}

/** F1-REQ-06: update the caller's own name and/or password. */
export async function updateOwnProfile(id, { name, password }) {
  const data = {};
  if (name) data.name = name;
  if (password) {
    if (password.length < 8) {
      throw new AuthError(400, "VALIDATION_ERROR", "Password must be at least 8 characters");
    }
    data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  const user = await prisma.user.update({ where: { id }, data });
  return toPublicUser(user);
}

/** SEC-05: strips passwordHash (and any other internal field) before a response ever sees it. */
function toPublicUser(user) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
