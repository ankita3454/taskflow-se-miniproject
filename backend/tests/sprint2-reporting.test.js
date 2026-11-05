import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.JWT_SECRET ??= "isolated-test-only";
const { default: app } = await import("../src/app.js");
const { default: db } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
const { metrics, burndown, csvCell } =
  await import("../src/sprint2/dashboard.js");
const { createReminderService, mailtrapSender } =
  await import("../src/sprint2/reminders.js");
let server, base, owner, member, outsider, p, other, tasks, ot, mt;
const run = randomUUID();
before(async () => {
  const create = (name) =>
    db.user.create({
      data: {
        name,
        email: `${name.toLowerCase()}-${run}@example.test`,
        passwordHash: "no-login",
      },
    });
  owner = await create("Owner");
  member = await create("Member");
  outsider = await create("Outsider");
  ot = signToken(owner);
  mt = signToken(member);
  p = await db.project.create({
    data: {
      name: `Sprint2-${run}`,
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, projectRole: "Owner" },
          { userId: member.id },
        ],
      },
    },
  });
  other = await db.project.create({
    data: {
      name: `Other-${run}`,
      ownerId: outsider.id,
      members: { create: { userId: outsider.id, projectRole: "Owner" } },
    },
  });
  tasks = await Promise.all(
    ["Alpha", "Beta", "Gamma", "Delta"].map((title, i) =>
      db.task.create({
        data: {
          projectId: p.id,
          title,
          description: i === 0 ? "find needle" : "",
          priority: i === 0 ? "HIGH" : "LOW",
          assigneeId: member.id,
          status: i < 2 ? "DONE" : i === 3 ? "IN_REVIEW" : "TODO",
        },
      }),
    ),
  );
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  const ids = [p.id, other.id],
    users = [owner.id, member.id, outsider.id];
  await db.notification.deleteMany({ where: { userId: { in: users } } });
  await db.task.deleteMany({ where: { projectId: { in: ids } } });
  await db.tag.deleteMany({ where: { projectId: { in: ids } } });
  await db.projectMember.deleteMany({ where: { projectId: { in: ids } } });
  await db.project.deleteMany({ where: { id: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
  await new Promise((r) => server.close(r));
});
async function call(
  path,
  { token = ot, method = "GET", body, text = false } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: text ? await r.text() : await r.json().catch(() => null),
  };
}
test("new feature routes reject missing/tampered JWTs and outsiders", async () => {
  for (const path of [
    `/projects/${p.id}/task-query`,
    `/projects/${p.id}/tags`,
    `/tasks/${tasks[0].id}/history`,
    `/projects/${p.id}/dashboard`,
  ]) {
    assert.equal((await call(path, { token: null })).status, 401);
    assert.equal((await call(path, { token: "tampered" })).status, 401);
    assert.equal(
      (await call(path, { token: signToken(outsider) })).status,
      403,
    );
  }
});
test("Today is personal, excludes Done/inaccessible tasks and includes future assigned In Review", async () => {
  const today = new Date().toISOString().slice(0, 10);
  await db.task.update({
    where: { id: tasks[2].id },
    data: { dueDate: new Date(today), status: "TODO" },
  });
  await db.task.update({
    where: { id: tasks[3].id },
    data: { dueDate: new Date("2099-01-01"), status: "IN_REVIEW" },
  });
  const r = await call("/dashboard/today", { token: mt });
  assert.equal(r.status, 200);
  assert.ok(r.data.tasks.some((t) => t.id === tasks[2].id));
  assert.ok(r.data.tasks.some((t) => t.id === tasks[3].id));
  assert.ok(!r.data.tasks.some((t) => t.id === tasks[0].id));
  assert.ok(r.data.tasks.every((t) => t.project.id === p.id));
});
test("dashboard metrics include zero workloads; sprint is explicit and CSV export is Owner-only", async () => {
  const r = await call(`/projects/${p.id}/dashboard`);
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 4);
  assert.equal(r.data.done, 2);
  assert.equal(r.data.completion, 50);
  assert.equal(r.data.workload.find((m) => m.userId === owner.id).open, 0);
  assert.equal(r.data.burndown, null);
  assert.equal(
    (
      await call(`/projects/${p.id}/sprint`, {
        method: "PUT",
        token: mt,
        body: { start: "2026-11-01", end: "2026-11-03" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/projects/${p.id}/sprint`, {
        method: "PUT",
        body: { start: "2026-11-01", end: "2026-11-03" },
      })
    ).status,
    200,
  );
  assert.ok((await call(`/projects/${p.id}/dashboard`)).data.burndown);
  assert.equal(
    (await call(`/projects/${p.id}/tasks.csv`, { token: mt })).status,
    403,
  );
  const csv = await call(`/projects/${p.id}/tasks.csv`, { text: true });
  assert.equal(csv.status, 200);
  assert.ok(
    csv.data.includes('"Title","Assignee","Status","Priority","Due date"'),
  );
  assert.ok(!csv.data.includes("Foreign"));
  assert.equal(csvCell("=SUM(1,2)"), `"'=SUM(1,2)"`);
  assert.equal(csvCell('a,"b"\nc'), `"a,""b""\nc"`);
});
test("burndown uses explicit dates and recorded status history, never future actuals", () => {
  const start = new Date("2026-01-01Z"),
    end = new Date("2026-01-03Z"),
    task = { id: "a", createdAt: start, dueDate: end };
  const b = burndown(
    [task],
    [
      {
        taskId: "a",
        createdAt: new Date("2026-01-02T12:00Z"),
        newValue: "DONE",
      },
    ],
    start,
    end,
    new Date("2026-01-02T15:00Z"),
  );
  assert.deepEqual(
    b.days.map((d) => d.plannedRemaining),
    [1, 1, 0],
  );
  assert.deepEqual(
    b.days.map((d) => d.actualRemaining),
    [1, 0, null],
  );
  assert.equal(metrics([], [], start).completion, 0);
});
test("reminder retries/concurrent runs send each interval at most once and suppress Done", async () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(today.getTime() + 3 * 86400000);
  const task = await db.task.create({
    data: {
      projectId: p.id,
      title: "Reminder task",
      priority: "LOW",
      assigneeId: member.id,
      dueDate: due,
    },
  });
  const done = await db.task.create({
    data: {
      projectId: p.id,
      title: "Done reminder",
      priority: "LOW",
      assigneeId: member.id,
      dueDate: due,
      status: "DONE",
    },
  });
  let sends = [];
  const run = createReminderService(db, async (m) => sends.push(m));
  await Promise.all([run(today), run(today)]);
  await run(today);
  assert.equal(sends.filter((m) => m.text.includes("Reminder task")).length, 1);
  assert.equal(sends.filter((m) => m.text.includes("Done reminder")).length, 0);
  assert.equal(await db.reminder.count({ where: { taskId: done.id } }), 0);
  assert.equal(
    await db.notification.count({
      where: { taskId: task.id, type: "DUE_REMINDER" },
    }),
    1,
  );
  await run(new Date(today.getTime() + 2 * 86400000));
  assert.equal(sends.filter((m) => m.text.includes("Reminder task")).length, 2);
  assert.ok(sends.every((m) => m.to === member.email));
});
test("uncertain SMTP failures are retained and not automatically duplicated", async () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const task = await db.task.create({
    data: {
      projectId: p.id,
      title: "Uncertain",
      priority: "LOW",
      assigneeId: member.id,
      dueDate: new Date(today.getTime() + 86400000),
    },
  });
  let attempts = 0;
  const run = createReminderService(db, async () => {
    attempts++;
    throw new Error("Ambiguous SMTP result");
  });
  await run(today);
  await run(today);
  assert.equal(attempts, 1);
  assert.equal(
    (await db.reminder.findFirst({ where: { taskId: task.id } })).state,
    "UNKNOWN",
  );
  assert.throws(() =>
    mailtrapSender({
      MAILTRAP_HOST: "smtp.external.example",
      MAILTRAP_USER: "x",
      MAILTRAP_PASSWORD: "y",
    }),
  );
});
