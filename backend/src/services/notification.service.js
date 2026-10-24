import * as notificationRepository from "../repositories/notification.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Repository injection allows business logic to be unit-tested
// without connecting to a real database.
export function createNotificationService(
  repository = notificationRepository,
) {
  async function notifyTaskAssigned(taskId, db) {
    if (typeof taskId !== "string" || !UUID_PATTERN.test(taskId)) {
      throw new Error("A valid task ID is required");
    }

    const task = await repository.findNotificationTask(taskId, db);

    if (!task) {
      throw new Error("Task not found");
    }

    // An unassigned task has no recipient.
    if (!task.assigneeId) {
      return null;
    }

    const membership = await repository.findProjectMembership(
      task.projectId,
      task.assigneeId,
      db,
    );

    if (!membership) {
      throw new Error("Task assignee is not a project member");
    }

    return repository.createNotification(
      {
        userId: task.assigneeId,
        taskId: task.id,
        type: "TASK_ASSIGNED",
        body: `You have been assigned the task "${task.title}".`,
      },
      db,
    );
  }

    // Call after the task status has been updated.
  // Pass the status that existed before the update.
  async function notifyTaskStatusChanged(taskId, previousStatus, db) {
    const validStatuses = [
      "TODO",
      "IN_PROGRESS",
      "IN_REVIEW",
      "DONE",
    ];

    if (typeof taskId !== "string" || !UUID_PATTERN.test(taskId)) {
      throw new Error("A valid task ID is required");
    }

    if (!validStatuses.includes(previousStatus)) {
      throw new Error("A valid previous task status is required");
    }

    const task = await repository.findNotificationTask(taskId, db);

    if (!task) {
      throw new Error("Task not found");
    }

    if (!validStatuses.includes(task.status)) {
      throw new Error("Task has an invalid status");
    }

    // No actual change, or no assignee: no notification.
    if (task.status === previousStatus || !task.assigneeId) {
      return null;
    }

    const membership = await repository.findProjectMembership(
      task.projectId,
      task.assigneeId,
      db,
    );

    if (!membership) {
      throw new Error("Task assignee is not a project member");
    }

    const statusLabels = {
      TODO: "To Do",
      IN_PROGRESS: "In Progress",
      IN_REVIEW: "In Review",
      DONE: "Done",
    };

    return repository.createNotification(
      {
        userId: task.assigneeId,
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
        body: `Task "${task.title}" changed from ${statusLabels[previousStatus]} to ${statusLabels[task.status]}.`,
      },
      db,
    );
  }

    // Called by the comment service after detecting mentioned user IDs.
  async function notifyTaskMentioned(taskId, mentionedUserIds, db) {
    if (typeof taskId !== "string" || !UUID_PATTERN.test(taskId)) {
      throw new Error("A valid task ID is required");
    }

    if (
      !Array.isArray(mentionedUserIds) ||
      mentionedUserIds.some(
        (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
      )
    ) {
      throw new Error("Mentioned user IDs must be an array of valid UUIDs");
    }

    const task = await repository.findNotificationTask(taskId, db);

    if (!task) {
      throw new Error("Task not found");
    }

    // Mentioning the same member repeatedly in one comment
    // should create only one notification for that member.
    const recipients = [...new Set(mentionedUserIds)];

    // Validate every recipient before creating any notifications.
    for (const userId of recipients) {
      const membership = await repository.findProjectMembership(
        task.projectId,
        userId,
        db,
      );

      if (!membership) {
        throw new Error("Mentioned user is not a project member");
      }
    }

    const notifications = [];

    for (const userId of recipients) {
      const notification = await repository.createNotification(
        {
          userId,
          taskId: task.id,
          type: "TASK_MENTIONED",
          body: `You were mentioned in a comment on task "${task.title}".`,
        },
        db,
      );

      notifications.push(notification);
    }

    return notifications;
  }

  return {
    notifyTaskAssigned,
    notifyTaskStatusChanged,
    notifyTaskMentioned,
  };
}

export default createNotificationService();