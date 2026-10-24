// Per-project and per-task permission checks (issue #3, SRS 6.5, F1-REQ-09,
// F4-REQ-07, SEC-02). Each one must run after requireAuth.
//
// Usage in a route file:
//
//   router.post("/projects/:projectId/archive",
//     requireAuth, requireProjectOwner(), archiveProject);
//
//   router.patch("/tasks/:taskId/status",
//     requireAuth, requireTaskStatusChange(), changeStatus);
//
// On success the loaded records are attached for the handler to use:
// req.project and req.projectAccess, plus req.task for task checks.
//
// See docs/PERMISSIONS.md for which check guards which action.

import { getProjectAccess, getTaskAccess } from "../services/permissionService.js";

const fail = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

/** Reads an ID from the route params first, then the JSON body. */
function readId(req, name) {
  return req.params?.[name] ?? req.body?.[name];
}

function projectCheck(allowed, deniedMessage, { param = "projectId" } = {}) {
  return async (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, "UNAUTHENTICATED", "Missing or malformed bearer token");
    }
    let access;
    try {
      access = await getProjectAccess(req.user.id, readId(req, param));
    } catch (error) {
      return next(error);
    }
    if (!access) {
      return fail(res, 404, "NOT_FOUND", "Project not found");
    }
    if (!allowed(access)) {
      return fail(res, 403, "FORBIDDEN", deniedMessage);
    }
    req.project = access.project;
    req.projectAccess = access;
    return next();
  };
}

function taskCheck(allowed, deniedMessage, { param = "taskId" } = {}) {
  return async (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, "UNAUTHENTICATED", "Missing or malformed bearer token");
    }
    let access;
    try {
      access = await getTaskAccess(req.user.id, readId(req, param));
    } catch (error) {
      return next(error);
    }
    if (!access) {
      return fail(res, 404, "NOT_FOUND", "Task not found");
    }
    if (!allowed(access)) {
      return fail(res, 403, "FORBIDDEN", deniedMessage);
    }
    req.task = access.task;
    req.project = access.project;
    req.projectAccess = access;
    return next();
  };
}

/** Any member of the project (including its Owner): view it, create tasks in it. */
export const requireProjectMember = (options) =>
  projectCheck((a) => a.isMember, "You are not a member of this project", options);

/** Only the project's Owner: invite, remove or re-role members, archive (F4-REQ-07). */
export const requireProjectOwner = (options) =>
  projectCheck((a) => a.isOwner, "Only the project Owner can do this", options);

/** Any member of the task's project: view the task. */
export const requireTaskMember = (options) =>
  taskCheck((a) => a.isMember, "You are not a member of this task's project", options);

/** Only the Owner of the task's project: assign or reassign the task (SRS 6.5). */
export const requireTaskProjectOwner = (options) =>
  taskCheck((a) => a.isOwner, "Only the project Owner can do this", options);

/** Only the task's assignee or the project's Owner: change its status (SRS 6.5). */
export const requireTaskStatusChange = (options) =>
  taskCheck(
    (a) => a.canChangeStatus,
    "Only the task's assignee or the project Owner can change its status",
    options,
  );
