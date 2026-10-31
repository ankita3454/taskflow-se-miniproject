import { jest } from "@jest/globals";
import { createNotificationService } from "../src/services/notification.service.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "55555555-5555-4555-8555-555555555555";
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

    const result = await service.notifyTaskAssigned(TASK_ID, undefined, OWNER_ID);

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
      service.notifyTaskAssigned("invalid-id", undefined, OWNER_ID),
    ).rejects.toThrow("A valid task ID is required");

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects a task that does not exist", async () => {
    repository.findNotificationTask.mockResolvedValue(null);

    await expect(
      service.notifyTaskAssigned(TASK_ID, undefined, OWNER_ID),
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
      service.notifyTaskAssigned(TASK_ID, undefined, OWNER_ID),
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
      service.notifyTaskAssigned(TASK_ID, undefined, OWNER_ID),
    ).rejects.toThrow("Task assignee is not a project member");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });
});

describe("Task-status notifications", () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = {
      findNotificationTask: jest.fn().mockResolvedValue({
        id: TASK_ID,
        title: "Build task form",
        projectId: PROJECT_ID,
        assigneeId: USER_ID,
        status: "IN_PROGRESS",
        project: { ownerId: OWNER_ID },
      }),
      findProjectMembership: jest.fn().mockResolvedValue({
        userId: USER_ID,
      }),
      createNotification: jest.fn().mockResolvedValue({
        id: "notification-status-1",
        isRead: false,
      }),
    };

    service = createNotificationService(repository);
  });

  test("notifies the assignee when the status changes", async () => {
    const result = await service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID);

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
        type: "TASK_STATUS_CHANGED",
        body: 'Task "Build task form" changed from To Do to In Progress.',
      },
      undefined,
    );

    expect(result).toEqual({
      id: "notification-status-1",
      isRead: false,
    });
  });

  test("does not notify when the status is unchanged", async () => {
    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "IN_PROGRESS", undefined, OWNER_ID),
    ).resolves.toBeNull();

    expect(repository.findProjectMembership).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("does not notify when the task is unassigned", async () => {
    repository.findNotificationTask.mockResolvedValue({
      id: TASK_ID,
      projectId: PROJECT_ID,
      assigneeId: null,
      status: "IN_PROGRESS",
        project: { ownerId: OWNER_ID },
    });

    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID),
    ).resolves.toBeNull();

    expect(repository.findProjectMembership).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects an invalid task ID before querying", async () => {
    await expect(
      service.notifyTaskStatusChanged("invalid-id", "TODO", undefined, OWNER_ID),
    ).rejects.toThrow("A valid task ID is required");

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects an invalid previous status before querying", async () => {
    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "INVALID", undefined, OWNER_ID),
    ).rejects.toThrow("A valid previous task status is required");

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects a missing task", async () => {
    repository.findNotificationTask.mockResolvedValue(null);

    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID),
    ).rejects.toThrow("Task not found");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects an invalid stored status", async () => {
    repository.findNotificationTask.mockResolvedValue({
      id: TASK_ID,
      projectId: PROJECT_ID,
      assigneeId: USER_ID,
      status: "INVALID",
    });

    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID),
    ).rejects.toThrow("Task has an invalid status");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("does not notify a removed assignee", async () => {
    repository.findProjectMembership.mockResolvedValue(null);

    await expect(
      service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID),
    ).resolves.toBeNull();

    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("passes the transaction client to repository calls", async () => {
    const transaction = {};

    await service.notifyTaskStatusChanged(TASK_ID, "TODO", transaction, OWNER_ID);

    expect(repository.findNotificationTask).toHaveBeenCalledWith(
      TASK_ID,
      transaction,
    );

    expect(repository.findProjectMembership).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      transaction,
    );

    expect(repository.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        type: "TASK_STATUS_CHANGED",
      }),
      transaction,
    );
  });
});

describe("Mention notifications", () => {
  const SECOND_USER_ID = "44444444-4444-4444-8444-444444444444";

  let repository;
  let service;

  beforeEach(() => {
    repository = {
      findNotificationTask: jest.fn().mockResolvedValue({
        id: TASK_ID,
        title: "Build task form",
        projectId: PROJECT_ID,
      }),
      findProjectMembership: jest.fn().mockResolvedValue({
        userId: USER_ID,
      }),
      createNotification: jest.fn().mockImplementation(async (data) => ({
        id: `notification-${data.userId}`,
        ...data,
        isRead: false,
      })),
    };

    service = createNotificationService(repository);
  });

  test("creates a notification for each mentioned project member", async () => {
    const result = await service.notifyTaskMentioned(
      TASK_ID,
      [USER_ID, SECOND_USER_ID],
    );

    expect(repository.createNotification).toHaveBeenCalledTimes(2);

    for (const userId of [USER_ID, SECOND_USER_ID]) {
      expect(repository.findProjectMembership).toHaveBeenCalledWith(
        PROJECT_ID,
        userId,
        undefined,
      );

      expect(repository.createNotification).toHaveBeenCalledWith(
        {
          userId,
          taskId: TASK_ID,
          type: "TASK_MENTIONED",
          body: 'You were mentioned in a comment on task "Build task form".',
        },
        undefined,
      );
    }

    expect(result).toHaveLength(2);
  });

  test("notifies a repeatedly mentioned member only once per call", async () => {
    const result = await service.notifyTaskMentioned(
      TASK_ID,
      [USER_ID, USER_ID],
    );

    expect(repository.findProjectMembership).toHaveBeenCalledTimes(1);
    expect(repository.createNotification).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  test("creates no notifications when nobody is mentioned", async () => {
    await expect(
      service.notifyTaskMentioned(TASK_ID, []),
    ).resolves.toEqual([]);

    expect(repository.findProjectMembership).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects an invalid task ID before querying", async () => {
    await expect(
      service.notifyTaskMentioned("invalid-id", [USER_ID]),
    ).rejects.toThrow("A valid task ID is required");

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test.each([
    ["missing list", undefined],
    ["null list", null],
    ["string instead of array", USER_ID],
    ["invalid user ID", ["invalid-id"]],
    ["non-string user ID", [123]],
  ])("rejects %s before querying", async (_label, recipients) => {
    await expect(
      service.notifyTaskMentioned(TASK_ID, recipients),
    ).rejects.toThrow(
      "Mentioned user IDs must be an array of valid UUIDs",
    );

    expect(repository.findNotificationTask).not.toHaveBeenCalled();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("rejects a task that does not exist", async () => {
    repository.findNotificationTask.mockResolvedValue(null);

    await expect(
      service.notifyTaskMentioned(TASK_ID, [USER_ID]),
    ).rejects.toThrow("Task not found");

    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("validates all recipients before creating notifications", async () => {
    repository.findProjectMembership
      .mockResolvedValueOnce({ userId: USER_ID })
      .mockResolvedValueOnce(null);

    await expect(
      service.notifyTaskMentioned(
        TASK_ID,
        [USER_ID, SECOND_USER_ID],
      ),
    ).rejects.toThrow("Mentioned user is not a project member");

    // Even the first valid recipient must not be notified
    // when another supplied recipient fails validation.
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  test("passes the transaction client to repository calls", async () => {
    const transaction = {};

    await service.notifyTaskMentioned(
      TASK_ID,
      [USER_ID],
      transaction,
    );

    expect(repository.findNotificationTask).toHaveBeenCalledWith(
      TASK_ID,
      transaction,
    );

    expect(repository.findProjectMembership).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      transaction,
    );

    expect(repository.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        type: "TASK_MENTIONED",
      }),
      transaction,
    );
  });
});
describe("Actor-aware status recipients", () => {
  let repository;
  let service;
  beforeEach(() => {
    repository = {
      findNotificationTask: jest.fn().mockResolvedValue({
        id: TASK_ID, title: "Actor test task", projectId: PROJECT_ID,
        assigneeId: USER_ID, status: "IN_PROGRESS", project: { ownerId: OWNER_ID },
      }),
      findProjectMembership: jest.fn().mockResolvedValue({ userId: USER_ID }),
      createNotification: jest.fn().mockImplementation(async data => data),
    };
    service = createNotificationService(repository);
  });
  test("requires the assignment actor instead of guessing the recipient rule", async () => {
    await expect(service.notifyTaskAssigned(TASK_ID)).rejects.toThrow("A valid actor ID is required");
    expect(repository.createNotification).not.toHaveBeenCalled();
  });
  test("requires the status actor instead of silently notifying the assignee", async () => {
    await expect(service.notifyTaskStatusChanged(TASK_ID, "TODO")).rejects.toThrow("A valid actor ID is required");
    expect(repository.createNotification).not.toHaveBeenCalled();
  });
  test("an assignee status change notifies the canonical project Owner", async () => {
    const result = await service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, USER_ID);
    expect(result.userId).toBe(OWNER_ID);
    expect(repository.findProjectMembership).not.toHaveBeenCalled();
  });
  test("a person who is both Owner and assignee receives no self-notification", async () => {
    repository.findNotificationTask.mockResolvedValue({ id: TASK_ID, assigneeId: OWNER_ID, status: "IN_PROGRESS", project: { ownerId: OWNER_ID } });
    await expect(service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, OWNER_ID)).resolves.toBeNull();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });
  test("an unrelated actor cannot generate a status notification", async () => {
    await expect(service.notifyTaskStatusChanged(TASK_ID, "TODO", undefined, PROJECT_ID)).rejects.toThrow("Status actor must be the assignee or project Owner");
    expect(repository.createNotification).not.toHaveBeenCalled();
  });
});
