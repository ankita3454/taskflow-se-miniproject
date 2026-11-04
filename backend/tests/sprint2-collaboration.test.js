import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.JWT_SECRET ??= "isolated-test-only";
const { default: app } = await import("../src/app.js");
const { default: db } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
const { mentionEmails, createCollaboration } = await import("../src/sprint2/collaboration.js");
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
test("project-management rejects malformed project IDs before opening a transaction", async () => {
  let transactions = 0;
  const service = createCollaboration({
    $transaction() {
      transactions++;
      throw new Error("Invalid project IDs must not reach storage");
    },
  });
  for (const projectId of ["not-a-uuid", "", null, undefined, 123, [], {}]) {
    for (const operation of [
      () => service.manage(owner.id, projectId, member.id, { projectRole: "Member" }),
      () => service.remove(owner.id, projectId, member.id),
      () => service.archive(owner.id, projectId),
    ]) {
      await assert.rejects(operation(), (error) =>
        error.status === 404 && error.code === "NOT_FOUND");
    }
  }
  assert.equal(transactions, 0);
});
test("project-management APIs reject malformed IDs with 404, preserve data and still require authentication", async () => {
  const before = {
    project: await db.project.findUnique({ where: { id: p.id } }),
    members: await db.projectMember.findMany({ where: { projectId: p.id }, orderBy: { userId: "asc" } }),
    audits: await db.auditLog.count({ where: { actorId: owner.id } }),
  };
  for (const id of ["not-a-uuid", "00000000-0000-0000-0000-not-a-uuid"]) {
    for (const [method, path, body] of [
      ["POST", `/projects/${id}/archive`, undefined],
      ["PATCH", `/projects/${id}/members/${member.id}`, { projectRole: "Member" }],
      ["DELETE", `/projects/${id}/members/${member.id}`, undefined],
    ]) {
      const result = await call(path, { method, body });
      assert.equal(result.status, 404, `${method} ${path}`);
      assert.equal(result.data.error.code, "NOT_FOUND");
      assert.equal((await call(path, { method, body, token: null })).status, 401);
    }
  }
  assert.deepEqual(await db.project.findUnique({ where: { id: p.id } }), before.project);
  assert.deepEqual(await db.projectMember.findMany({ where: { projectId: p.id }, orderBy: { userId: "asc" } }), before.members);
  assert.equal(await db.auditLog.count({ where: { actorId: owner.id } }), before.audits);
});
test("comment mentions notify active members once and preserve chronological immutable history", async () => {
  const before = await db.notification.count({
    where: { taskId: tasks[3].id, type: "TASK_MENTIONED" },
  });
  const r = await call(`/tasks/${tasks[3].id}/comments`, {
    method: "POST",
    body: {
      body: `Hello @${member.email} @${member.email} @${outsider.email}`,
    },
  });
  assert.equal(r.status, 201);
  assert.equal(
    await db.notification.count({
      where: { taskId: tasks[3].id, type: "TASK_MENTIONED" },
    }),
    before + 1,
  );
  assert.equal(
    (
      await call(`/tasks/${tasks[3].id}/comments`, {
        method: "POST",
        body: { body: "x".repeat(2001) },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/tasks/${tasks[3].id}/comments`, {
        method: "POST",
        body: { body: "x".repeat(2000) },
      })
    ).status,
    201,
  );
  const history = await call(`/tasks/${tasks[3].id}/history`);
  assert.equal(history.data.comments.length, 2);
  assert.equal(history.data.comments[0].authorName, owner.name);
  assert.ok(history.data.activities.some((a) => a.field === "comment"));
  assert.equal(
    (
      await call(`/tasks/${tasks[3].id}/comments/${r.data.comment.id}`, {
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.deepEqual(
    mentionEmails(`@${member.email} @${member.email} invalid@nope`),
    [member.email],
  );
});
test("membership removal revokes access without deleting attribution; archive blocks creation", async () => {
  assert.equal(
    (await call(`/projects/${p.id}/members/${owner.id}`, { method: "DELETE" }))
      .status,
    409,
  );
  assert.equal(
    (await call(`/projects/${p.id}/archive`, { method: "POST", token: mt }))
      .status,
    403,
  );
  assert.equal(
    (await call(`/projects/${p.id}/members/${member.id}`, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(
    (await call(`/tasks/${tasks[3].id}/history`, { token: mt })).status,
    403,
  );
  assert.equal(
    (await db.task.findUnique({ where: { id: tasks[3].id } })).assigneeId,
    member.id,
  );
  assert.equal(
    (await call(`/projects/${p.id}/archive`, { method: "POST" })).status,
    204,
  );
  assert.equal(
    (
      await call("/tasks", {
        method: "POST",
        body: { projectId: p.id, title: "Archived", priority: "LOW" },
      })
    ).status,
    409,
  );
  assert.equal((await call(`/projects/${p.id}/task-query`)).status, 200);
});
test("ownership transfer is atomic, unique and independent of system role", async () => {
  await db.projectMember.create({
    data: { projectId: p.id, userId: member.id },
  });
  assert.equal(
    (
      await call(`/projects/${p.id}/members/${member.id}`, {
        method: "PATCH",
        body: { projectRole: "Owner" },
      })
    ).status,
    204,
  );
  assert.equal(
    (await db.project.findUnique({ where: { id: p.id } })).ownerId,
    member.id,
  );
  assert.equal(
    (await db.user.findUnique({ where: { id: member.id } })).role,
    "MEMBER",
  );
  assert.equal(
    (
      await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: p.id, userId: owner.id } },
      })
    ).projectRole,
    "Member",
  );
  assert.equal(
    (await call(`/projects/${p.id}/archive`, { method: "POST" })).status,
    403,
  );
});
