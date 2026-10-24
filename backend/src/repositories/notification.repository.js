import prisma from "./prisma.js";

// Store one notification.
// A transaction client can be supplied by the calling service.
export async function createNotification(
  { userId, taskId, type, body },
  db = prisma,
) {
  return db.notification.create({
    data: {
      userId,
      taskId,
      type,
      body,
    },
  });
}

// Read the task information needed to build a notification.
export async function findNotificationTask(taskId, db = prisma) {
  return db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      assigneeId: true,
      status: true,
    },
  });
}

// Check whether a proposed recipient belongs to the project.
export async function findProjectMembership(
  projectId,
  userId,
  db = prisma,
) {
  return db.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
    select: {
      userId: true,
    },
  });
}