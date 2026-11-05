import { randomUUID } from "node:crypto";
import db from "../../src/repositories/prisma.js";
import { signToken } from "../../src/utils/jwt.js";
export async function fixture(count = 1000, memberCount = 20) {
  const suffix = randomUUID();
  const users = [];
  let project;
  try {
    for (let i = 0; i < memberCount; i++)
      users.push(
        await db.user.create({
          data: {
            name: `Load user ${i}`,
            email: `load-${i}-${suffix}@example.test`,
            passwordHash: "benchmark-no-login",
          },
        }),
      );
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 6 * 86400000);
    project = await db.project.create({
      data: {
        name: `Disposable performance ${suffix}`,
        ownerId: users[0].id,
        sprintStart: start,
        sprintEnd: end,
        members: {
          create: users.map((u, i) => ({
            userId: u.id,
            projectRole: i === 0 ? "Owner" : "Member",
          })),
        },
      },
    });
    await db.task.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        projectId: project.id,
        title: `Benchmark task ${i}`,
        description: i % 10 === 0 ? "needle searchable text" : "ordinary text",
        priority: i % 2 ? "LOW" : "HIGH",
        status: i % 4 === 0 ? "DONE" : "TODO",
        assigneeId: users[i % users.length].id,
        dueDate: new Date(start.getTime() + (i % 7) * 86400000),
      })),
    });
    const completed = await db.task.findMany({
      where: { projectId: project.id, status: "DONE" },
      select: { id: true },
    });
    await db.activityLog.createMany({
      data: completed.map((t) => ({
        taskId: t.id,
        actorId: users[0].id,
        field: "status",
        oldValue: "TODO",
        newValue: "DONE",
      })),
    });
    return {
      project,
      users,
      tokens: users.map(signToken),
      count,
      cleanup: () => remove(project, users),
    };
  } catch (e) {
    await remove(project, users);
    throw e;
  }
}
async function remove(project, users) {
  if (project) {
    await db.task.deleteMany({ where: { projectId: project.id } });
    await db.projectMember.deleteMany({ where: { projectId: project.id } });
    await db.project.delete({ where: { id: project.id } });
  }
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}
