import prisma from "../repositories/prisma.js";
import { isUuid } from "../services/permissionService.js";
export class FeatureError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
export const fail = (status, code, message) => {
  throw new FeatureError(status, code, message);
};
export function object(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "VALIDATION_ERROR", "A JSON object is required");
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail(400, "VALIDATION_ERROR", "Unsupported input field");
  return value;
}
export function uuid(id) {
  if (!isUuid(id)) fail(404, "NOT_FOUND", "Resource not found");
  return id;
}
export function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(400, "VALIDATION_ERROR", "Use a YYYY-MM-DD date");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    fail(400, "VALIDATION_ERROR", "Invalid calendar date");
  return d;
}
export async function projectAccess(
  userId,
  projectId,
  db = prisma,
  ownerOnly = false,
) {
  uuid(projectId);
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });
  if (!project) fail(404, "NOT_FOUND", "Project not found");
  const owner = project.ownerId === userId;
  if (
    !owner &&
    (ownerOnly || !project.members.some((m) => m.userId === userId))
  )
    fail(403, "FORBIDDEN", "Project access denied");
  return project;
}
export async function taskAccess(
  userId,
  taskId,
  db = prisma,
  ownerOnly = false,
) {
  uuid(taskId);
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) fail(404, "NOT_FOUND", "Task not found");
  const project = await projectAccess(userId, task.projectId, db, ownerOnly);
  return { task, project };
}
export const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof FeatureError)
      return res
        .status(e.status)
        .json({ error: { code: e.code, message: e.message } });
    if (e.code === "P2002")
      return res
        .status(409)
        .json({
          error: { code: "CONFLICT", message: "Resource already exists" },
        });
    return next(e);
  }
};
export async function lockProject(db, id) {
  await db.$queryRaw`SELECT project_id FROM projects WHERE project_id = ${id}::uuid FOR UPDATE`;
}
