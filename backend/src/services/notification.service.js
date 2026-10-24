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

  return {
    notifyTaskAssigned,
  };
}

export default createNotificationService();