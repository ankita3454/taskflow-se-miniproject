import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../repositories/prisma.js";
import { signToken } from "../utils/jwt.js";
import {
  EMAIL_MAX,
  PASSWORD_MAX_BYTES,
  asObject,
  assertValid,
  normaliseEmail,
  validateEmail,
  validateName,
  validatePassword,
  ValidationError,
} from "../utils/validation.js";

const BCRYPT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const emailInUse = () => new AuthError(409, "EMAIL_IN_USE", "E-mail already in use");
const invalidCredentials = () =>
  new AuthError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");

function isUniqueViolation(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecordNotFound(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/**
 * F1-REQ-01/02/03: register a new user with a unique e-mail and a bcrypt-hashed
 * password; never persists the plaintext password.
 */
export async function registerUser(body) {
  const { name, email, password } = asObject(body);

  assertValid({
    name: validateName(name),
    email: validateEmail(email),
    password: validatePassword(password),
  });

  const normalisedEmail = normaliseEmail(email);

  // Fast path: skip the bcrypt work when the e-mail is obviously taken.
  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    throw emailInUse();
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    user = await prisma.user.create({
      data: { name: name.trim(), email: normalisedEmail, passwordHash },
    });
  } catch (error) {
    // Two concurrent registrations can both pass the check above. The
    // database's unique constraint stops the second one; report it as the
    // same 409 instead of a 500 (F1-REQ-02).
    if (isUniqueViolation(error)) {
      throw emailInUse();
    }
    throw error;
  }

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

/**
 * F1-REQ-04/05: authenticate by e-mail + password; issues a JWT on success.
 * Missing or non-string credentials are a 400. Any well-formed attempt that
 * fails gets the SAME generic 401, whether the e-mail doesn't exist or the
 * password is wrong, so a caller can't enumerate valid accounts.
 */
export async function authenticateUser(body) {
  const { email, password } = asObject(body);

  if (
    typeof email !== "string" ||
    email.trim() === "" ||
    typeof password !== "string" ||
    password === ""
  ) {
    throw new ValidationError("E-mail and password are required");
  }

  // Values that can't belong to any account are rejected without a lookup,
  // with the same generic message.
  if (
    email.trim().length > EMAIL_MAX ||
    Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES
  ) {
    throw invalidCredentials();
  }

  const user = await prisma.user.findUnique({ where: { email: normaliseEmail(email) } });
  if (!user || !user.active) {
    throw invalidCredentials();
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw invalidCredentials();
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

const PROFILE_FIELDS = new Set(["name", "password"]);

/**
 * F1-REQ-06: update the caller's own name and/or password. Every submitted
 * field is validated (SEC-03); fields this endpoint doesn't own (email, role,
 * active, ...) are rejected rather than silently ignored.
 */
export async function updateOwnProfile(id, body) {
  const fields = asObject(body);
  const submitted = Object.keys(fields);

  const unknown = submitted.filter((key) => !PROFILE_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(`Only name and password can be updated (got: ${unknown.join(", ")})`);
  }
  if (submitted.length === 0) {
    throw new ValidationError("Provide a name or a password to update");
  }

  assertValid({
    name: "name" in fields ? validateName(fields.name) : null,
    password: "password" in fields ? validatePassword(fields.password) : null,
  });

  const data = {};
  if ("name" in fields) data.name = fields.name.trim();
  if ("password" in fields) {
    data.passwordHash = await bcrypt.hash(fields.password, BCRYPT_ROUNDS);
  }

  try {
    const user = await prisma.user.update({ where: { id }, data });
    return toPublicUser(user);
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new AuthError(404, "NOT_FOUND", "User not found");
    }
    throw error;
  }
}

/** SEC-05: strips passwordHash (and any other internal field) before a response ever sees it. */
function toPublicUser(user) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
