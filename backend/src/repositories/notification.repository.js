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

// List only the signed-in user's notifications, newest first.
export async function listUserNotifications(userId, db = prisma) {
  return db.notification.findMany({
    where: { userId },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
}

// Count only this user's unread notifications.
export async function countUnreadNotifications(userId, db = prisma) {
  return db.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

// Scope the update to the recipient so users cannot change
// another user's notification, even if they know its ID.
export async function markUserNotificationRead(
  notificationId,
  userId,
  db = prisma,
) {
  return db.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      isRead: true,
    },
  });
}

// Mark only this user's unread notifications as read.
export async function markAllUserNotificationsRead(
  userId,
  db = prisma,
) {
  return db.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });
}