import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { jest } from "@jest/globals";
import app from "../src/app.js";
import prisma from "../src/repositories/prisma.js";
import { signToken } from "../src/utils/jwt.js";

jest.setTimeout(30000);

describe("Protected notification API", () => {
  let server;
  let baseUrl;
  let users;
  let token;
  let ownUnread;
  let ownRead;
  let otherUnread;

  beforeAll(async () => {
    const runId = randomUUID();
    const passwordHash = await bcrypt.hash("NotificationApiTest123!", 12);

    users = await prisma.$transaction(async (db) => {
      const first = await db.user.create({
        data: {
          name: "Notification API First",
          email: `notification-api-first-${runId}@example.test`,
          passwordHash,
        },
      });

      const second = await db.user.create({
        data: {
          name: "Notification API Second",
          email: `notification-api-second-${runId}@example.test`,
          passwordHash,
        },
      });

      return { first, second };
    });

    token = signToken(users.first);

    await new Promise((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", resolve);
      server.once("error", reject);
    });

    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [users.first.id, users.second.id] },
      },
    });

    ownUnread = await prisma.notification.create({
      data: {
        userId: users.first.id,
        type: "TASK_ASSIGNED",
        body: "First user's unread notification",
      },
    });

    ownRead = await prisma.notification.create({
      data: {
        userId: users.first.id,
        type: "TASK_MENTIONED",
        body: "First user's read notification",
        isRead: true,
      },
    });

    otherUnread = await prisma.notification.create({
      data: {
        userId: users.second.id,
        type: "TASK_ASSIGNED",
        body: "Second user's private notification",
      },
    });
  });

  afterAll(async () => {
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } finally {
      try {
        if (users) {
          const ids = [users.first.id, users.second.id];

          await prisma.$transaction(async (db) => {
            await db.notification.deleteMany({
              where: { userId: { in: ids } },
            });

            await db.user.deleteMany({
              where: { id: { in: ids } },
            });
          });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  async function request(path = "", method = "GET", bearer = token) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: bearer
        ? { Authorization: `Bearer ${bearer}` }
        : {},
    });
  }

  test.each([
    ["GET", ""],
    ["GET", "/unread-count"],
    ["PATCH", "/read-all"],
    ["PATCH", "/44444444-4444-4444-8444-444444444444/read"],
  ])("%s %s rejects an unauthenticated request", async (method, path) => {
    const response = await request(path, method, null);

    expect(response.status).toBe(401);
  });

  test("rejects an invalid token", async () => {
    const response = await request("", "GET", "invalid-token");

    expect(response.status).toBe(401);
  });

  test("lists only the signed-in user's notifications", async () => {
    const response = await request();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.notifications).toHaveLength(2);

    expect(data.notifications.map((item) => item.id).sort()).toEqual(
      [ownUnread.id, ownRead.id].sort(),
    );

    expect(
      data.notifications.every((item) => item.userId === users.first.id),
    ).toBe(true);
  });

  test("counts only the signed-in user's unread notifications", async () => {
    const response = await request("/unread-count");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unreadCount: 1 });
  });

  test("marks an owned notification read and updates the unread count", async () => {
    const response = await request(`/${ownUnread.id}/read`, "PATCH");

    expect(response.status).toBe(200);

    const stored = await prisma.notification.findUnique({
      where: { id: ownUnread.id },
    });

    expect(stored.isRead).toBe(true);

    const countResponse = await request("/unread-count");

    expect(await countResponse.json()).toEqual({ unreadCount: 0 });
  });

  test("marking an already-read notification succeeds", async () => {
    const response = await request(`/${ownRead.id}/read`, "PATCH");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  test("cannot mark another user's notification read", async () => {
    const response = await request(`/${otherUnread.id}/read`, "PATCH");

    expect(response.status).toBe(404);

    const stored = await prisma.notification.findUnique({
      where: { id: otherUnread.id },
    });

    expect(stored.isRead).toBe(false);
  });

  test("returns 404 for an unknown notification", async () => {
    const response = await request(`/${randomUUID()}/read`, "PATCH");

    expect(response.status).toBe(404);
  });

  test("returns 404 for a malformed notification ID", async () => {
    const response = await request("/invalid-id/read", "PATCH");

    expect(response.status).toBe(404);
  });

  test("mark-all changes only the signed-in user's notifications", async () => {
    const response = await request("/read-all", "PATCH");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 1 });

    const ownRemaining = await prisma.notification.count({
      where: { userId: users.first.id, isRead: false },
    });

    const otherStored = await prisma.notification.findUnique({
      where: { id: otherUnread.id },
    });

    expect(ownRemaining).toBe(0);
    expect(otherStored.isRead).toBe(false);

    const repeated = await request("/read-all", "PATCH");

    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toEqual({ updatedCount: 0 });
  });
});