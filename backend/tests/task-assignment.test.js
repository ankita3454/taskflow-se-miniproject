// F5-REQ-01/02 assignment API tests against DATABASE_URL.
// Run with: npm test (needs DATABASE_URL and applied migrations).

import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
const { default: jwt } = await import("jsonwebtoken");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `assign-${RUN_ID}-${label}@test.example.com`;
const PASSWORD_HASH = "x".repeat(60);

let server;
let base;
let project;
let otherProject;
let task;
const users = {};
const tokens = {};

async function makeUser(label) {
  const user = await prisma.user.create({
    data: { name: label, email: emailFor(label), passwordHash: PASSWORD_HASH },
  });
  users[label] = user;
  tokens[label] = signToken(user);
  return user;
}

async function call(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function resetAssignee(assigneeId = null) {
  return prisma.task.update({
    where: { id: task.id },
    data: { assigneeId },
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;

  for (const label of ["owner", "memberA", "memberB", "outsider", "otherOwner"]) {
    await makeUser(label);
  }

  project = await prisma.project.create({
    data: {
      name: `Assignment ${RUN_ID}`,
      ownerId: users.owner.id,
      members: {
        create: [
          { userId: users.owner.id, projectRole: "Owner" },
          { userId: users.memberA.id },
          { userId: users.memberB.id },
        ],
      },
    },
  });
  otherProject = await prisma.project.create({
    data: {
      name: `Other ${RUN_ID}`,
      ownerId: users.otherOwner.id,
      members: {
        create: [{ userId: users.otherOwner.id, projectRole: "Owner" }],
      },
    },
  });
  task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: `Assignment test ${RUN_ID}`,
      priority: "MEDIUM",
    },
  });
});

after(async () => {
  if (task) {
    await prisma.activityLog.deleteMany({ where: { taskId: task.id } });
    await prisma.notification.deleteMany({ where: { taskId: task.id } });
    await prisma.task.delete({ where: { id: task.id } });
  }
  const projectIds = [project?.id, otherProject?.id].filter(Boolean);
  await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `assign-${RUN_ID}-` } } });
  await prisma.$disconnect();
  server.close();
});

describe("task assignment (F5-REQ-01/02, SRS 6.5)", () => {
  test("an Owner assigns a task to a project member and creates an in-app notification", async () => {
    await resetAssignee();
    const response = await call(`/tasks/${task.id}/assignee`, {
      method: "PATCH",
      body: { assigneeId: users.memberA.id },
      token: tokens.owner,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.assigneeId, users.memberA.id);
    assert.equal(response.body.task.assignee.name, "memberA");

    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(stored.assigneeId, users.memberA.id);
    const notification = await prisma.notification.findFirst({
      where: { taskId: task.id, userId: users.memberA.id, type: "TASK_ASSIGNED" },
    });
    assert.ok(notification);
  });

  test("an Owner reassigns a task to a different project member", async () => {
    await resetAssignee(users.memberA.id);
    const response = await call(`/tasks/${task.id}/assignee`, {
      method: "PATCH",
      body: { assigneeId: users.memberB.id },
      token: tokens.owner,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.assigneeId, users.memberB.id);
    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(stored.assigneeId, users.memberB.id);
    assert.ok(
      await prisma.notification.findFirst({
        where: { taskId: task.id, userId: users.memberB.id, type: "TASK_ASSIGNED" },
      }),
    );
  });

  test("rejects non-members and malformed assignee IDs without changing assignment", async () => {
    for (const assigneeId of [users.outsider.id, randomUUID(), "not-a-uuid"]) {
      await resetAssignee(users.memberA.id);
      const response = await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body: { assigneeId },
        token: tokens.owner,
      });
      assert.equal(response.status, 400);
      const unchanged = await prisma.task.findUnique({ where: { id: task.id } });
      assert.equal(unchanged.assigneeId, users.memberA.id);
    }
  });

  test("rejects assignment by non-Owners and Owners of another project", async () => {
    for (const actor of ["memberA", "otherOwner"]) {
      await resetAssignee(users.memberA.id);
      const response = await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body: { assigneeId: users.memberB.id },
        token: tokens[actor],
      });
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, "FORBIDDEN");
      const unchanged = await prisma.task.findUnique({ where: { id: task.id } });
      assert.equal(unchanged.assigneeId, users.memberA.id);
    }
  });

  test("requires an assignee ID and rejects unsupported assignment fields", async () => {
    for (const body of [{}, { assigneeId: null }, { assigneeId: users.memberB.id, projectId: project.id }]) {
      const response = await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body,
        token: tokens.owner,
      });
      assert.equal(response.status, 400);
    }
  });

  test("missing, invalid and expired JWTs receive 401", async () => {
    const expired = jwt.sign({ sub: users.owner.id }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });
    for (const token of [undefined, "invalid-token", expired]) {
      const response = await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body: { assigneeId: users.memberA.id },
        token,
      });
      assert.equal(response.status, 401);
    }
  });

  test("the assignee selector data is limited to active project members", async () => {
    const response = await call(`/projects/${project.id}/members`, {
      token: tokens.owner,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.members.map(({ user }) => user.id).sort(),
      [users.owner.id, users.memberA.id, users.memberB.id].sort(),
    );
  });
});
