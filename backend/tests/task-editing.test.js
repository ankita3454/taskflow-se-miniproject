import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `task-edit-${RUN_ID}-${label}@test.example.com`;

let server;
let base;
const users = {};
const tokens = {};
let project;
let task;

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

async function call(
  path,
  { method = "GET", body, as, headers: extraHeaders = {} } = {},
) {
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
      title: "Original task",
      description: "Original description",
      priority: "MEDIUM",
      projectId: project.id,
      ...overrides,
    },
  });
}

async function readTask(taskId = task.id) {
  return prisma.task.findUnique({ where: { id: taskId } });
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await makeUser("owner");
  await makeUser("member");
  await makeUser("outsider");

  project = await prisma.project.create({
    data: {
      name: `Task Editing ${RUN_ID}`,
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
        userId: users.member.id,
      },
    ],
  });

  task = await makeTask();
});

after(async () => {
  if (project) {
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

  await prisma.user.deleteMany({
    where: { email: { startsWith: `task-edit-${RUN_ID}-` } },
  });

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await prisma.$disconnect();
});

describe("Issue #6: Authorised Task Editing", () => {
  test("the project Owner can update task details", async () => {
    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "owner",
      body: {
        title: "Updated task",
        description: "Updated description",
        priority: "HIGH",
        dueDate: "2027-01-15",
        timeEstimate: 3.5,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.task.title, "Updated task");
    assert.equal(response.body.task.description, "Updated description");
    assert.equal(response.body.task.priority, "HIGH");

    const saved = await readTask();
    assert.equal(saved.title, "Updated task");
    assert.equal(saved.description, "Updated description");
    assert.equal(saved.priority, "HIGH");
    assert.equal(saved.dueDate.toISOString().slice(0, 10), "2027-01-15");
    assert.equal(saved.timeEstimate, 3.5);
  });

  test("a project Member cannot edit task details", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "member",
      body: { title: "Member's change" },
    });

    assert.equal(response.status, 403);
    assert.equal((await readTask()).title, beforeTask.title);
  });

  test("an outsider cannot edit a task", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "outsider",
      body: { title: "Outsider's change" },
    });

    assert.equal(response.status, 403);
    assert.equal((await readTask()).title, beforeTask.title);
  });

  test("an unauthenticated request receives 401", async () => {
    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      body: { title: "Unauthenticated change" },
    });

    assert.equal(response.status, 401);
  });

  test("an invalid title is rejected without changing the task", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "owner",
      body: { title: "   " },
    });

    assert.equal(response.status, 400);
    assert.equal((await readTask()).title, beforeTask.title);
  });

  test("a title exceeding 200 characters is rejected", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "owner",
      body: { title: "x".repeat(201) },
    });

    assert.equal(response.status, 400);
    assert.equal((await readTask()).title, beforeTask.title);
  });

  test("an invalid priority is rejected without changing the task", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "owner",
      body: { priority: "URGENT" },
    });

    assert.equal(response.status, 400);
    assert.equal((await readTask()).priority, beforeTask.priority);
  });

  test("unsupported fields such as status cannot be edited through this endpoint", async () => {
    const beforeTask = await readTask();

    const response = await call(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      as: "owner",
      body: { status: "DONE" },
    });

    assert.equal(response.status, 400);
    assert.equal((await readTask()).status, beforeTask.status);
  });

  test("a completed task cannot be edited", async () => {
    const completedTask = await makeTask({
      title: "Completed task",
      status: "DONE",
    });

    const response = await call(`/api/v1/tasks/${completedTask.id}`, {
      method: "PATCH",
      as: "owner",
      body: { title: "Should not be saved" },
    });

    assert.equal(response.status, 409);
    assert.equal((await readTask(completedTask.id)).title, "Completed task");
  });
});
