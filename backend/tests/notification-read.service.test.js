import { jest } from "@jest/globals";
import { createNotificationReadService } from "../src/services/notification-read.service.js";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";

describe("Notification read controls", () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = {
      listUserNotifications: jest.fn(),
      countUnreadNotifications: jest.fn(),
      markUserNotificationRead: jest.fn(),
      markAllUserNotificationsRead: jest.fn(),
    };

    service = createNotificationReadService(repository);
  });

  test("lists notifications for the signed-in user", async () => {
    const notifications = [{ id: NOTIFICATION_ID, userId: USER_ID }];
    repository.listUserNotifications.mockResolvedValue(notifications);

    await expect(service.listNotifications(USER_ID)).resolves.toEqual(
      notifications,
    );

    expect(repository.listUserNotifications).toHaveBeenCalledWith(USER_ID);
  });

  test("returns an empty list when the user has no notifications", async () => {
    repository.listUserNotifications.mockResolvedValue([]);

    await expect(service.listNotifications(USER_ID)).resolves.toEqual([]);
  });

  test("returns the user's unread count", async () => {
    repository.countUnreadNotifications.mockResolvedValue(3);

    await expect(service.getUnreadCount(USER_ID)).resolves.toBe(3);

    expect(repository.countUnreadNotifications).toHaveBeenCalledWith(USER_ID);
  });

  test("returns zero when there are no unread notifications", async () => {
    repository.countUnreadNotifications.mockResolvedValue(0);

    await expect(service.getUnreadCount(USER_ID)).resolves.toBe(0);
  });

  test("marks a notification read using both its ID and recipient ID", async () => {
    repository.markUserNotificationRead.mockResolvedValue({ count: 1 });

    await expect(
      service.markNotificationRead(NOTIFICATION_ID, USER_ID),
    ).resolves.toEqual({ success: true });

    expect(repository.markUserNotificationRead).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      USER_ID,
    );
  });

  test("returns 404 when no notification belonging to the user matches", async () => {
    repository.markUserNotificationRead.mockResolvedValue({ count: 0 });

    await expect(
      service.markNotificationRead(NOTIFICATION_ID, USER_ID),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Notification not found",
    });
  });

  test.each([undefined, null, "", "invalid-id", 123])(
    "rejects an invalid notification ID without querying: %p",
    async (invalidId) => {
      await expect(
        service.markNotificationRead(invalidId, USER_ID),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });

      expect(repository.markUserNotificationRead).not.toHaveBeenCalled();
    },
  );

  test("marks all notifications read for the signed-in user", async () => {
    repository.markAllUserNotificationsRead.mockResolvedValue({ count: 4 });

    await expect(
      service.markAllNotificationsRead(USER_ID),
    ).resolves.toEqual({ updatedCount: 4 });

    expect(repository.markAllUserNotificationsRead).toHaveBeenCalledWith(
      USER_ID,
    );
  });

  test("mark-all succeeds when nothing needs updating", async () => {
    repository.markAllUserNotificationsRead.mockResolvedValue({ count: 0 });

    await expect(
      service.markAllNotificationsRead(USER_ID),
    ).resolves.toEqual({ updatedCount: 0 });
  });

  test("propagates database failures instead of reporting success", async () => {
    repository.markUserNotificationRead.mockRejectedValue(
      new Error("Database unavailable"),
    );

    await expect(
      service.markNotificationRead(NOTIFICATION_ID, USER_ID),
    ).rejects.toThrow("Database unavailable");
  });
});