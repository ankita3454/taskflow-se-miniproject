import * as notificationRepository from "../repositories/notification.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  const error = new Error("Notification not found");
  error.status = 404;
  error.code = "NOT_FOUND";
  return error;
}

export function createNotificationReadService(
  repository = notificationRepository,
) {
  async function listNotifications(userId) {
    return repository.listUserNotifications(userId);
  }

  async function getUnreadCount(userId) {
    return repository.countUnreadNotifications(userId);
  }

  async function markNotificationRead(notificationId, userId) {
    if (
      typeof notificationId !== "string" ||
      !UUID_PATTERN.test(notificationId)
    ) {
      throw notFound();
    }

    const result = await repository.markUserNotificationRead(
      notificationId,
      userId,
    );

    // Unknown IDs and notifications belonging to another user
    // receive the same response.
    if (result.count === 0) {
      throw notFound();
    }

    return { success: true };
  }

  async function markAllNotificationsRead(userId) {
    const result = await repository.markAllUserNotificationsRead(userId);

    return { updatedCount: result.count };
  }

  return {
    listNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  };
}

export default createNotificationReadService();