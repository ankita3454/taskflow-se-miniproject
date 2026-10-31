
import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `task-status-${RUN_ID}-${label}@test.example.com`;

let server;
let base;
const users = {};
const tokens = {};
let project;
let otherProject;

async function makeUser(label) {
  const user = await prisma.user.create({
    data: {
      name: label,
      email: emailFor(label),
      passwordHash: "x".repeat(60),
    },
  });

  users[label] = user;
  tokens[label] = signToken(user);
  return user;
}

async function call(path, {
  method = "GET",
  body,
  as,
  headers: extraHeaders = {},
} = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (as) {
    headers.Authorization = `Bearer ${tokens[as]}`;
  }

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function makeTask(overrides = {}) {
  return prisma.task.create({
    data: {
      projectId: project.id,
      title: `Workflow task ${randomUUID().slice(0, 8)}`,
      priority: "MEDIUM",
      status: "TODO",
      assigneeId: users.assignee.id,
      ...overrides,
    },
  });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await makeUser("owner");
  await makeUser("assignee");
  await makeUser("member");
  await makeUser("outsider");

  project = await prisma.project.create({
    data: {
      name: `Task Status ${RUN_ID}`,
      ownerId: users.owner.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      {
        projectId: project.id,
        userId: users.owner.id,
        projectRole: "Owner",
      },
      {
        projectId: project.id,
        userId: users.assignee.id,
      },
      {
        projectId: project.id,
        userId: users.member.id,
      },
    ],
  });
  otherProject = await prisma.project.create({
    data: {
      name: `Other Task Status ${RUN_ID}`,
      ownerId: users.outsider.id,
    },
  });
  await prisma.projectMember.create({
    data: {
      projectId: otherProject.id,
      userId: users.outsider.id,
      projectRole: "Owner",
    },
  });
});

after(async () => {
  if (project) {
    await prisma.notification.deleteMany({ where: { userId: { in: Object.values(users).map(user => user.id) } } });
    const projectTasks = await prisma.task.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });

    await prisma.activityLog.deleteMany({
      where: {
        taskId: {
          in: projectTasks.map((task) => task.id),
        },
      },
    });

    await prisma.task.deleteMany({
      where: { projectId: project.id },
    });

    await prisma.projectMember.deleteMany({
      where: { projectId: project.id },
    });

    await prisma.project.deleteMany({
      where: { id: project.id },
    });
  }

  if (otherProject) {
    await prisma.projectMember.deleteMany({
      where: { projectId: otherProject.id },
    });

    await prisma.project.deleteMany({
      where: { id: otherProject.id },
    });
  }

  await prisma.user.deleteMany({
    where: { email: { startsWith: `task-status-${RUN_ID}-` } },
  });

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await prisma.$disconnect();
});

describe("Issue #7: Task Status Workflow", () => {
  test("TODO → IN_PROGRESS is allowed", async () => {
    const task = await makeTask();

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "assignee",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.status, "IN_PROGRESS");

    const saved = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(saved.status, "IN_PROGRESS");
    // Verify the status transition was logged.
    const logs = await prisma.activityLog.findMany({
      where: { taskId: task.id },
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].actorId, users.assignee.id);
    assert.equal(logs[0].field, "status");
    assert.equal(logs[0].oldValue, "TODO");
    assert.equal(logs[0].newValue, "IN_PROGRESS");
    assert.ok(logs[0].createdAt instanceof Date);
    assert.ok(!Number.isNaN(logs[0].createdAt.getTime()));
  });

  test("IN_PROGRESS → IN_REVIEW is allowed", async () => {
    const task = await makeTask({ status: "IN_PROGRESS" });

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_REVIEW" },
      as: "assignee",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.status, "IN_REVIEW");
  });

  test("IN_REVIEW → IN_PROGRESS is allowed when changes are requested", async () => {
    const task = await makeTask({ status: "IN_REVIEW" });

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "assignee",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.status, "IN_PROGRESS");
  });

  test("IN_REVIEW → DONE is allowed", async () => {
    const task = await makeTask({ status: "IN_REVIEW" });

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "DONE" },
      as: "assignee",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.status, "DONE");
  });

  test("IN_PROGRESS → TODO is allowed only when unassigned", async () => {
    // An unassigned task is allowed to transition back to TODO.
    const unassignedTask = await makeTask({
      status: "IN_PROGRESS",
      assigneeId: null,
    });

    const allowed = await call(`/api/v1/tasks/${unassignedTask.id}/status`, {
      method: "PATCH",
      body: { status: "TODO" },
      as: "owner",
    });

    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.task.status, "TODO");

    // Verify that the successful transition was logged.
    const allowedLogs = await prisma.activityLog.findMany({
      where: { taskId: unassignedTask.id },
    });

    assert.equal(allowedLogs.length, 1);
    assert.equal(allowedLogs[0].actorId, users.owner.id);
    assert.equal(allowedLogs[0].field, "status");
    assert.equal(allowedLogs[0].oldValue, "IN_PROGRESS");
    assert.equal(allowedLogs[0].newValue, "TODO");
    assert.ok(allowedLogs[0].createdAt instanceof Date);

    // An assigned task is not allowed to transition back to TODO.
    const assignedTask = await makeTask({
      status: "IN_PROGRESS",
      assigneeId: users.assignee.id,
    });

    const rejected = await call(`/api/v1/tasks/${assignedTask.id}/status`, {
      method: "PATCH",
      body: { status: "TODO" },
      as: "owner",
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, "INVALID_STATUS_TRANSITION");

    const saved = await prisma.task.findUnique({
      where: { id: assignedTask.id },
    });

    assert.equal(saved.status, "IN_PROGRESS");

    // Verify that the rejected transition did not create an activity log.
    const rejectedLogs = await prisma.activityLog.findMany({
      where: { taskId: assignedTask.id },
    });

    assert.equal(rejectedLogs.length, 0);
  });

  test("TODO → DONE is rejected and status remains unchanged", async () => {
    const task = await makeTask();

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "DONE" },
      as: "owner",
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_STATUS_TRANSITION");

    const saved = await prisma.task.findUnique({ where: { id: task.id } });
    assert.equal(saved.status, "TODO");

    // A rejected transition must not create an activity log.
    const logs = await prisma.activityLog.findMany({
      where: { taskId: task.id },
    });

    assert.equal(logs.length, 0);
  });

  test("DONE cannot transition to another status", async () => {
    const task = await makeTask({ status: "DONE" });

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "owner",
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_STATUS_TRANSITION");
  });

  test("invalid status value is rejected", async () => {
    const task = await makeTask();

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "BLOCKED" },
      as: "owner",
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  });

  test("only the assignee or project Owner can change status", async () => {
    const task = await makeTask({ assigneeId: users.assignee.id });

    const memberResponse = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "member",
    });

    assert.equal(memberResponse.status, 403);

    const assigneeResponse = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "assignee",
    });

    assert.equal(assigneeResponse.status, 200);
  });

  test("missing or invalid JWT is rejected with 401", async () => {
    const task = await makeTask();

    const missing = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
    });

    assert.equal(missing.status, 401);

    const invalid = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      headers: { Authorization: "Bearer invalid-token" },
    });

    assert.equal(invalid.status, 401);
  });

  test("expired JWT is rejected with 401", async () => {
    const task = await makeTask();

    const expiredToken = jwt.sign(
      { sub: users.assignee.id, role: users.assignee.role },
      process.env.JWT_SECRET,
      { expiresIn: -1 },
    );

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    assert.equal(response.status, 401);

    const saved = await prisma.task.findUnique({
      where: { id: task.id },
    });
    assert.equal(saved.status, "TODO");
  });

  test("Owner of another project cannot change the task status", async () => {
    const task = await makeTask();

    const response = await call(`/api/v1/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "outsider",
    });

    assert.equal(response.status, 403);

    const saved = await prisma.task.findUnique({
      where: { id: task.id },
    });
    assert.equal(saved.status, "TODO");
  });
});
