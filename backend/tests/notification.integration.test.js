import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import prisma from "../src/repositories/prisma.js";
import notificationService from "../src/services/notification.service.js";
import { jest } from "@jest/globals";

jest.setTimeout(30000);

describe("Notification database integration", () => {
  let fixture;

  beforeAll(async () => {
    const runId = randomUUID();
    const passwordHash = await bcrypt.hash("IntegrationTestOnly123!", 12);

    // Create all fixtures atomically. Never use real accounts.
    fixture = await prisma.$transaction(async (db) => {
      const owner = await db.user.create({
        data: {
          name: "Notification Test Owner",
          email: `notification-owner-${runId}@example.test`,
          passwordHash,
        },
      });

      const member = await db.user.create({
        data: {
          name: "Notification Test Member",
          email: `notification-member-${runId}@example.test`,
          passwordHash,
        },
      });

      const project = await db.project.create({
        data: {
          name: `Notification integration ${runId}`,
          ownerId: owner.id,
        },
      });

      await db.projectMember.createMany({
        data: [
          { projectId: project.id, userId: owner.id },
          { projectId: project.id, userId: member.id },
        ],
      });

      const task = await db.task.create({
        data: {
          projectId: project.id,
          title: "Notification integration task",
          priority: "MEDIUM",
          assigneeId: member.id,
        },
      });

      return { owner, member, project, task };
    });
  });

  afterEach(async () => {
    if (!fixture) return;

    // Delete only notifications belonging to this test's task.
    await prisma.notification.deleteMany({
      where: { taskId: fixture.task.id },
    });
  });

  afterAll(async () => {
    try {
      if (fixture) {
        await prisma.$transaction(async (db) => {
          await db.notification.deleteMany({
            where: { taskId: fixture.task.id },
          });
          await db.task.delete({
            where: { id: fixture.task.id },
          });
          await db.projectMember.deleteMany({
            where: { projectId: fixture.project.id },
          });
          await db.project.delete({
            where: { id: fixture.project.id },
          });
          await db.user.deleteMany({
            where: {
              id: {
                in: [fixture.owner.id, fixture.member.id],
              },
            },
          });
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function expectStored(notification, type) {
    const stored = await prisma.notification.findUnique({
      where: { id: notification.id },
    });

    expect(stored).not.toBeNull();
    expect(stored.userId).toBe(fixture.member.id);
    expect(stored.taskId).toBe(fixture.task.id);
    expect(stored.type).toBe(type);
    expect(stored.isRead).toBe(false);
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.body).toContain(fixture.task.title);
  }

  test("saves an assignment notification", async () => {
    const notification = await notificationService.notifyTaskAssigned(
      fixture.task.id,
    );

    await expectStored(notification, "TASK_ASSIGNED");
  });

  test("saves a notification after a status update", async () => {
    const notification = await prisma.$transaction(async (db) => {
      await db.task.update({
        where: { id: fixture.task.id },
        data: { status: "IN_PROGRESS" },
      });

      return notificationService.notifyTaskStatusChanged(
        fixture.task.id,
        "TODO",
        db,
      );
    });

    await expectStored(notification, "TASK_STATUS_CHANGED");
    expect(notification.body).toContain("To Do to In Progress");
  });

  test("saves one notification for a repeatedly mentioned member", async () => {
    const notifications = await notificationService.notifyTaskMentioned(
      fixture.task.id,
      [fixture.member.id, fixture.member.id],
    );

    expect(notifications).toHaveLength(1);
    await expectStored(notifications[0], "TASK_MENTIONED");

    const count = await prisma.notification.count({
      where: { taskId: fixture.task.id },
    });

    expect(count).toBe(1);
  });
});