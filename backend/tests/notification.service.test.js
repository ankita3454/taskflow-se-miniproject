import { jest } from "@jest/globals";
import { createNotificationService } from "../src/services/notification.service.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

describe("Assignment notifications", () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = {
      findNotificationTask: jest.fn(),
      findProjectMembership: jest.fn(),
      createNotification: jest.fn(),
    };

    service = createNotificationService(repository);
  });

  test("creates a notification for a valid project assignee", async () => {
    repository.findNotificationTask.mockResolvedValue({
      id: TASK_ID,
      title: "Build task form",
      projectId: PROJECT_ID,
      assigneeId: USER_ID,
    });

    repository.findProjectMembership.mockResolvedValue({
      userId: USER_ID,
    });

    const savedNotification = {
      id: "notification-1",
      isRead: false,
    };

    repository.createNotification.mockResolvedValue(savedNotification);

    const result = await service.notifyTaskAssigned(TASK_ID);

    expect(repository.findNotificationTask).toHaveBeenCalledWith(
      TASK_ID,
      undefined,
    );

    expect(repository.findProjectMembership).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      undefined,
    );

    expect(repository.createNotification).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        taskId: TASK_ID,
        type: "TASK_ASSIGNED",
        body: 'You have been assigned the task "Build task form".',
      },
      undefined,
    );

    expect(result).toEqual(savedNotification);
  });

  test("rejects an invalid task ID without querying the database", async () => {
    await expect(
      service.notifyTaskAssigned("invalid-id"),
    ).rejects.toThrow("A valid task ID is required");

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects a task that does not exist", async () => {
    repository.findNotificationTask.mockResolvedValue(null);

    await expect(
      service.notifyTaskAssigned(TASK_ID),
    ).rejects.toThrow("Task not found");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("does not notify when the task is unassigned", async () => {
    repository.findNotificationTask.mockResolvedValue({
      id: TASK_ID,
      projectId: PROJECT_ID,
      assigneeId: null,
    });

    await expect(
      service.notifyTaskAssigned(TASK_ID),
    ).resolves.toBeNull();

    expect(repository.findProjectMembership).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects an assignee outside the project", async () => {
    repository.findNotificationTask.mockResolvedValue({
      id: TASK_ID,
      projectId: PROJECT_ID,
      assigneeId: USER_ID,
    });

    repository.findProjectMembership.mockResolvedValue(null);

    await expect(
      service.notifyTaskAssigned(TASK_ID),
    ).rejects.toThrow("Task assignee is not a project member");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });
});