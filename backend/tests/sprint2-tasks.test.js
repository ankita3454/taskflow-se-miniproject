import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.JWT_SECRET ??= "isolated-test-only";
const { default: app } = await import("../src/app.js");
const { default: db } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
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
          status: i === 3 ? "IN_REVIEW" : "TODO",
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
test("dependencies reject self, direct/indirect cycles and cross-project references", async () => {
  const dependency = (a, b) =>
    call(`/tasks/${a.id}/dependencies`, {
      method: "POST",
      token: mt,
      body: { blockerId: b.id },
    });
  assert.equal((await dependency(tasks[0], tasks[0])).status, 409);
  assert.equal((await dependency(tasks[0], tasks[1])).status, 201);
  assert.equal((await dependency(tasks[1], tasks[2])).status, 201);
  assert.equal((await dependency(tasks[2], tasks[0])).status, 409);
  const foreign = await db.task.create({
    data: { title: "Foreign", priority: "LOW", projectId: other.id },
  });
  assert.equal((await dependency(tasks[0], foreign)).status, 404);
});
test("incomplete blockers prevent Done and preserve status; completion works after blockers finish", async () => {
  await db.task.update({
    where: { id: tasks[0].id },
    data: { status: "IN_REVIEW" },
  });
  const path = `/tasks/${tasks[0].id}/status`;
  assert.equal(
    (await call(path, { method: "PATCH", body: { status: "DONE" } })).status,
    409,
  );
  assert.equal(
    (await db.task.findUnique({ where: { id: tasks[0].id } })).status,
    "IN_REVIEW",
  );
  await db.task.update({
    where: { id: tasks[1].id },
    data: { status: "DONE" },
  });
  assert.equal(
    (await call(path, { method: "PATCH", body: { status: "DONE" } })).status,
    200,
  );
});
test("concurrent opposite dependency declarations cannot create a cycle", async () => {
  const a = tasks[2],
    b = tasks[3];
  const responses = await Promise.all(
    [
      [a, b],
      [b, a],
    ].map(([x, y]) =>
      call(`/tasks/${x.id}/dependencies`, {
        method: "POST",
        body: { blockerId: y.id },
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});
test("project-specific tags are case-insensitively unique and removal preserves shared tags", async () => {
  const make = (name) =>
    call(`/projects/${p.id}/tags`, {
      method: "POST",
      token: mt,
      body: { name },
    });
  const tag = (await make("Frontend")).data.tag;
  assert.equal((await make("frontend")).data.tag.id, tag.id);
  for (const t of tasks.slice(0, 2))
    assert.equal(
      (
        await call(`/tasks/${t.id}/tags/${tag.id}`, {
          method: "PUT",
          token: mt,
        })
      ).status,
      204,
    );
  assert.equal(
    (
      await call(`/tasks/${tasks[0].id}/tags/${tag.id}`, {
        method: "DELETE",
        token: mt,
      })
    ).status,
    204,
  );
  assert.equal(
    await db.taskTag.count({ where: { taskId: tasks[1].id, tagId: tag.id } }),
    1,
  );
  assert.ok(await db.tag.findUnique({ where: { id: tag.id } }));
  const foreign = await db.tag.create({
    data: { name: "Foreign", normalizedName: "foreign", projectId: other.id },
  });
  assert.equal(
    (await call(`/tasks/${tasks[0].id}/tags/${foreign.id}`, { method: "PUT" }))
      .status,
    404,
  );
});
test("search combines title/description, status, priority, assignee and date filters", async () => {
  const tag = await db.tag.findFirst({ where: { projectId: p.id } });
  const r = await call(
    `/projects/${p.id}/task-query?q=needle&status=DONE&priority=HIGH&assignee=${member.id}&sort=priority&direction=asc`,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.data.tasks.map((t) => t.id),
    [tasks[0].id],
  );
  const byTag = await call(`/projects/${p.id}/task-query?tag=${tag.id}`);
  assert.ok(byTag.data.tasks.some((t) => t.id === tasks[1].id));
  for (const q of [
    "status=INVALID",
    "sort=unknown",
    "from=2026-02-30",
    "from=2026-11-05&to=2026-11-01",
    "q[x]=bad",
  ])
    assert.equal((await call(`/projects/${p.id}/task-query?${q}`)).status, 400);
});
test("all sort directions and combined date/tag filters return the expected intersection", async () => {
  const dates = ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
  for (let i = 0; i < tasks.length; i++)
    await db.task.update({
      where: { id: tasks[i].id },
      data: {
        dueDate: new Date(dates[i]),
        createdAt: new Date(`2026-01-0${i + 1}T00:00Z`),
        priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"][i],
      },
    });
  for (const sort of ["createdAt", "dueDate", "priority"])
    for (const direction of ["asc", "desc"]) {
      const r = await call(
        `/projects/${p.id}/task-query?sort=${sort}&direction=${direction}`,
      );
      assert.equal(r.status, 200);
      assert.deepEqual(
        r.data.tasks.map((t) => t.id),
        [...tasks]
          .sort((a, b) =>
            direction === "asc"
              ? tasks.indexOf(a) - tasks.indexOf(b)
              : tasks.indexOf(b) - tasks.indexOf(a),
          )
          .map((t) => t.id),
      );
    }
  const tag = await db.tag.findFirst({
    where: { projectId: p.id, normalizedName: "frontend" },
  });
  const r = await call(
    `/projects/${p.id}/task-query?tag=${tag.id}&status=DONE&priority=MEDIUM&assignee=${member.id}&from=2026-01-03&to=2026-01-03&sort=dueDate&direction=asc`,
  );
  assert.deepEqual(
    r.data.tasks.map((t) => t.id),
    [tasks[1].id],
  );
  assert.deepEqual(
    (await call(`/projects/${p.id}/task-query?q=no-such-text`)).data.tasks,
    [],
  );
});
test("Owner-only task deletion cascades task children but preserves shared tags and security audit", async () => {
  const tag = await db.tag.findFirst({ where: { projectId: p.id } });
  assert.equal(
    (await call(`/tasks/${tasks[1].id}`, { method: "DELETE", token: mt }))
      .status,
    403,
  );
  await db.comment.create({
    data: { taskId: tasks[1].id, authorId: owner.id, body: "Will cascade" },
  });
  await db.activityLog.create({
    data: { taskId: tasks[1].id, actorId: owner.id, field: "title" },
  });
  assert.equal(
    (await call(`/tasks/${tasks[1].id}`, { method: "DELETE" })).status,
    204,
  );
  assert.equal(await db.comment.count({ where: { taskId: tasks[1].id } }), 0);
  assert.equal(
    await db.activityLog.count({ where: { taskId: tasks[1].id } }),
    0,
  );
  assert.ok(await db.tag.findUnique({ where: { id: tag.id } }));
  assert.ok(
    await db.auditLog.findFirst({
      where: { event: "TASK_DELETED", targetId: tasks[1].id },
    }),
  );
});
