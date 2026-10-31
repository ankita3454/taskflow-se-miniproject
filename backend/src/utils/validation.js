// Server-side input validation for F1 (SEC-03). Every rule here runs
// regardless of what the frontend already checked.

// Limits match the column sizes in prisma/schema.prisma (name VarChar(100),
// email VarChar(150)), so oversized input is a 400 instead of a database 500.
export const NAME_MAX = 100;
export const EMAIL_MAX = 150;
export const PROJECT_NAME_MAX = 150;
export const PASSWORD_MIN = 8;
// bcrypt only uses the first 72 bytes of a password, so anything longer
// would be silently truncated. Reject it instead.
export const PASSWORD_MAX_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}

/** Returns a plain object, or {} when the body is missing, an array or a primitive. */
export function asObject(body) {
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

export function validateName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "Name is required";
  }
  if (value.trim().length > NAME_MAX) {
    return `Name must be at most ${NAME_MAX} characters`;
  }
  return null;
}

export function validateProjectName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "Project name is required";
  }
  if ([...value.trim()].length > PROJECT_NAME_MAX) {
    return `Project name must be at most ${PROJECT_NAME_MAX} characters`;
  }
  return null;
}

export function validateEmail(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "E-mail is required";
  }
  const email = value.trim();
  if (email.length > EMAIL_MAX) {
    return `E-mail must be at most ${EMAIL_MAX} characters`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "E-mail address is not valid";
  }
  return null;
}

export function validatePassword(value) {
  if (typeof value !== "string" || value === "") {
    return "Password is required";
  }
  if (value.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes`;
  }
  return null;
}

/** E-mails are compared case-insensitively, so store and look them up in one form. */
export function normaliseEmail(value) {
  return value.trim().toLowerCase();
}

/** Throws a ValidationError listing every failing field, or returns nothing. */
export function assertValid(errors) {
  const failing = Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== null),
  );
  if (Object.keys(failing).length > 0) {
    throw new ValidationError(Object.values(failing)[0], failing);
  }
}
