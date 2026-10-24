import prisma from "../repositories/prisma.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for strings shaped like the UUIDs used as project/task/user IDs. */
export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * What `userId` may do in project `projectId`, or null if the project doesn't
 * exist (or the ID is malformed).
 *
 * Each project has exactly one Owner: the user in Project.ownerId (SRS 6.5,
 * F4-REQ-01, data dictionary). ProjectMember.projectRole never grants Owner
 * rights, and neither does a user's system role (MEMBER, OWNER, ADMIN).
 */
export async function getProjectAccess(userId, projectId) {
  if (!isUuid(projectId)) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId }, select: { userId: true } } },
  });
  if (!project) return null;

  const { members, ...projectFields } = project;
  const isOwner = project.ownerId === userId;
  const isMember = isOwner || members.length > 0;

  return { project: projectFields, isOwner, isMember };
}

/**
 * What `userId` may do with task `taskId`, or null if the task doesn't exist.
 * Adds isAssignee and canChangeStatus to the project access. SRS 6.5: only
 * the task's assignee or the project Owner can change its status. The
 * assignee must still be a member of the project, so someone removed from it
 * loses that right even if the task is still assigned to them.
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
    canChangeStatus: projectAccess.isOwner || (isAssignee && projectAccess.isMember),
  };
}
