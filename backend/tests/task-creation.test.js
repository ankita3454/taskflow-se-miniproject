
import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `task-create-${RUN_ID}-${label}@test.example.com`;

let server;
let base;
const users = {};
const tokens = {};
let project;
let archivedProject;

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

async function call(path, { method = "GET", body, as } = {}) {
  const headers = { "Content-Type": "application/json" };

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

const validTask = (overrides = {}) => ({
  projectId: project.id,
  title: "Implement task creation",
  description: "Test the Task Creation API",
  priority: "MEDIUM",
  ...overrides,
});

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  await makeUser("owner");
  await makeUser("member");
  await makeUser("outsider");

  project = await prisma.project.create({
    data: {
      name: `Task Creation ${RUN_ID}`,
      ownerId: users.owner.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: users.owner.id, projectRole: "Owner" },
      { projectId: project.id, userId: users.member.id },
    ],
  });

  archivedProject = await prisma.project.create({
    data: {
      name: `Archived Project ${RUN_ID}`,
      ownerId: users.owner.id,
      archived: true,
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: archivedProject.id,
      userId: users.owner.id,
      projectRole: "Owner",
    },
  });
});

after(async () => {
  const projectIds = [project?.id, archivedProject?.id].filter(Boolean);

  if (projectIds.length) {
    await prisma.task.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.projectMember.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.project.deleteMany({
      where: { id: { in: projectIds } },
    });
  }

  await prisma.user.deleteMany({
    where: { email: { startsWith: `task-create-${RUN_ID}-` } },
  });

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  await prisma.$disconnect();
});

describe("Issue #5: Task Creation API", () => {
  test("a project member can create a task with default TODO status", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask(),
      as: "member",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.task.title, "Implement task creation");
    assert.equal(response.body.task.projectId, project.id);
    assert.equal(response.body.task.priority, "MEDIUM");
    assert.equal(response.body.task.status, "TODO");
    assert.equal(response.body.task.assigneeId, null);
  });

  test("an authenticated project Owner can create a task", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ title: "Owner-created task" }),
      as: "owner",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.task.title, "Owner-created task");
  });

  test("an unauthenticated request is rejected", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask(),
    });

    assert.equal(response.status, 401);
  });

  test("a non-member cannot create a task in another project's project", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask(),
      as: "outsider",
    });

    assert.equal(response.status, 403);
  });

  test("a missing title is rejected with 400", async () => {
    const { title, ...body } = validTask();

    const response = await call("/api/v1/tasks", {
      method: "POST",
      body,
      as: "member",
    });

    assert.equal(response.status, 400);
  });

  test("an invalid priority is rejected with 400", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ priority: "URGENT" }),
      as: "member",
    });

    assert.equal(response.status, 400);
  });

  test("an invalid calendar date is rejected with 400", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ dueDate: "2026-02-30" }),
      as: "member",
    });

    assert.equal(response.status, 400);
  });

  test("a project member cannot assign a task", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ assigneeId: users.outsider.id }),
      as: "member",
    });

    assert.equal(response.status, 403);
  });

  test("the project Owner can assign a task to a project member", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ assigneeId: users.member.id }),
      as: "owner",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.task.assigneeId, users.member.id);
  });

  test("tasks cannot be created in an archived project", async () => {
    const response = await call("/api/v1/tasks", {
      method: "POST",
      body: {
        ...validTask(),
        projectId: archivedProject.id,
      },
      as: "owner",
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "PROJECT_ARCHIVED");
  });

  test("an authorized member can list project tasks", async () => {
    const created = await call("/api/v1/tasks", {
      method: "POST",
      body: validTask({ title: "Task to find in list" }),
      as: "member",
    });

    assert.equal(created.status, 201);

    const response = await call(
      `/api/v1/projects/${project.id}/tasks`,
      { as: "member" },
    );

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.tasks));
    assert.ok(
      response.body.tasks.some(
        (task) => task.id === created.body.task.id,
      ),
    );
  });
});
