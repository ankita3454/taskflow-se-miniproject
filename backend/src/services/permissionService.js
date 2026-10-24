import prisma from "../repositories/prisma.js";

// Value of ProjectMember.projectRole that makes a member an Owner of that
// project. New members join as "Member" (F4-REQ-04); an Owner can change it
// (F4-REQ-05).
export const PROJECT_OWNER_ROLE = "Owner";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for strings shaped like the UUIDs used as project/task/user IDs. */
export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * What `userId` may do in project `projectId`, or null if the project doesn't
 * exist (or the ID is malformed).
 *
 * Owner: the user who created the project, or a member whose project role is
 * "Owner". Ownership is always per project. A user's system role (MEMBER,
 * OWNER, ADMIN) never grants rights in a project they don't own.
 */
export async function getProjectAccess(userId, projectId) {
  if (!isUuid(projectId)) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId }, select: { projectRole: true } } },
  });
  if (!project) return null;

  const { members, ...projectFields } = project;
  const membership = members[0];
  const isOwner =
    project.ownerId === userId || membership?.projectRole === PROJECT_OWNER_ROLE;
  const isMember = isOwner || Boolean(membership);

  return { project: projectFields, isOwner, isMember };
}

/**
 * What `userId` may do with task `taskId`, or null if the task doesn't exist.
 * Adds isAssignee and canChangeStatus (SRS 6.5: only the task's assignee or
 * the project Owner can change its status) to the project access.
 */
export async function getTaskAccess(userId, taskId) {
  if (!isUuid(taskId)) return null;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;

  const projectAccess = await getProjectAccess(userId, task.projectId);
  const isAssignee = task.assigneeId !== null && task.assigneeId === userId;

  return {
    ...projectAccess,
    task,
    isAssignee,
    canChangeStatus: isAssignee || projectAccess.isOwner,
  };
}
