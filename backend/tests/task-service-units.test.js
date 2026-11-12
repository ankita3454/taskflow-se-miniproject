import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import notificationService from "../src/services/notification.service.js";
import {
  assignTask,
  changeTaskStatus,
  createTask,
  listAccessibleProjects,
  listProjectMembers,
  listProjectTasks,
  TaskError,
  updateTask,
} from "../src/services/taskService.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";
const body = { projectId, title: "Test task", priority: "MEDIUM" };
const project = { id: projectId, ownerId, archived: false };
const task = {
  id: taskId,
  projectId,
  title: "Test task",
  description: null,
  priority: "MEDIUM",
  dueDate: null,
  timeEstimate: null,
  status: "TODO",
  assigneeId: null,
};

function failure(code, status = 400) {
  return (error) => error instanceof TaskError && error.code === code && error.status === status;
}

function makeDb(overrides = {}) {
  const tx = {
    $queryRaw: async () => [],
    project: { findUnique: async () => project },
    projectMember: {
      findUnique: async () => ({ userId: ownerId }),
      findMany: async () => [],
    },
    user: { findUnique: async () => ({ id: memberId, active: true }) },
    task: {
      findUnique: async () => task,
      findMany: async () => [],
      create: async () => task,
      update: async () => task,
      updateMany: async () => ({ count: 1 }),
    },
    taskDependency: { count: async () => 0 },
    taskCreationRequest: {
      findUnique: async () => null,
      create: async () => ({ id: "request-id" }),
      update: async () => ({}),
    },
    activityLog: { createMany: async () => ({ count: 1 }) },
    notification: { create: async () => ({ id: "notification-id" }) },
    reminder: {},
  };
  Object.assign(tx, overrides);
  const db = {
    ...tx,
    $transaction: async (callback) => callback(tx),
  };
  return { db, tx };
}

function projectAccess(overrides = {}) {
  return { project, isOwner: true, ...overrides, project: { ...project, ...overrides.project } };
}

test("task creation rejects malformed and out-of-range input before storage", async () => {
  const { db } = makeDb();
  const invalidBodies = [
    null,
    [],
    { ...body, unexpected: true },
    { ...body, projectId: "" },
    { ...body, title: " " },
    { ...body, title: "x".repeat(201) },
    { ...body, description: 12 },
    { ...body, description: "x".repeat(2001) },
    { ...body, priority: "URGENT" },
    { ...body, dueDate: "2026-02-30" },
    { ...body, timeEstimate: -1 },
    { ...body, timeEstimate: Infinity },
    { ...body, assigneeId: "not-a-uuid" },
  ];
  for (const invalidBody of invalidBodies) {
    await assert.rejects(
      createTask({ body: invalidBody, userId: ownerId, projectAccess: projectAccess() }, db),
      failure("VALIDATION_ERROR"),
    );
  }
});

test("task creation enforces authorized project, archive, and assignment restrictions", async () => {
  const { db } = makeDb();
  await assert.rejects(
    createTask({
      body,
      userId: ownerId,
      projectAccess: projectAccess({ project: { id: memberId } }),
    }, db),
    failure("PROJECT_ID_MISMATCH"),
  );
  await assert.rejects(
    createTask({
      body,
      userId: ownerId,
      projectAccess: projectAccess({ project: { archived: true } }),
    }, db),
    failure("PROJECT_ARCHIVED", 409),
  );

  const assignedBody = { ...body, assigneeId: memberId };
  await assert.rejects(
    createTask({
      body: assignedBody,
      userId: ownerId,
      projectAccess: projectAccess({ isOwner: false }),
    }, db),
    failure("FORBIDDEN", 403),
  );
  db.user.findUnique = async () => null;
  await assert.rejects(
    createTask({ body: assignedBody, userId: ownerId, projectAccess: projectAccess() }, db),
    failure("VALIDATION_ERROR"),
  );
  db.user.findUnique = async () => ({ id: memberId, active: false });
  await assert.rejects(
    createTask({ body: assignedBody, userId: ownerId, projectAccess: projectAccess() }, db),
    failure("VALIDATION_ERROR"),
  );
  db.user.findUnique = async () => ({ id: memberId, active: true });
  db.projectMember.findUnique = async () => null;
  await assert.rejects(
    createTask({ body: assignedBody, userId: ownerId, projectAccess: projectAccess() }, db),
    failure("VALIDATION_ERROR"),
  );
});

test("task creation normalizes optional fields and checks membership in its transaction", async () => {
  let created;
  const { db, tx } = makeDb();
  tx.task.create = async (args) => {
    created = args.data;
    return { ...task, ...args.data };
  };
  const result = await createTask({
    body: {
      ...body,
      title: "  Trimmed  ",
      description: "  Details  ",
      dueDate: "2026-12-31",
      timeEstimate: 1.5,
    },
    userId: ownerId,
    projectAccess: projectAccess(),
  }, db);
  assert.equal(result.title, "Trimmed");
  assert.equal(created.description, "Details");
  assert.equal(created.dueDate.toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(created.timeEstimate, 1.5);
  assert.equal(created.status, undefined);
});

test("task creation handles inaccessible or archived projects and assignment rechecks", async () => {
  const { db, tx } = makeDb();
  tx.project.findUnique = async () => null;
  await assert.rejects(
    createTask({ body, userId: ownerId, projectAccess: projectAccess() }, db),
    failure("FORBIDDEN", 403),
  );
  tx.project.findUnique = async () => ({ ...project, archived: true });
  await assert.rejects(
    createTask({ body, userId: ownerId, projectAccess: projectAccess() }, db),
    failure("PROJECT_ARCHIVED", 409),
  );
  tx.project.findUnique = async () => project;
  let membershipReads = 0;
  tx.projectMember.findUnique = async ({ where }) => {
    membershipReads++;
    if (where.projectId_userId.userId === ownerId) return { userId: ownerId };
    return membershipReads === 1 ? { userId: memberId } : null;
  };
  await assert.rejects(
    createTask({
      body: { ...body, assigneeId: memberId },
      userId: ownerId,
      projectAccess: projectAccess(),
    }, db),
    failure("FORBIDDEN", 403),
  );
  tx.projectMember.findUnique = async () => ({ user: { active: false } });
  await assert.rejects(
    createTask({
      body: { ...body, assigneeId: memberId },
      userId: ownerId,
      projectAccess: projectAccess(),
    }, db),
    failure("FORBIDDEN", 403),
  );
});

test("idempotent task creation replays matching requests and rejects mismatched or missing results", async () => {
  const key = "task-create-key";
  const normalized = {
    projectId,
    title: "Test task",
    description: null,
    priority: "MEDIUM",
    dueDate: null,
    timeEstimate: null,
    assigneeId: null,
  };
  const payloadHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const { db, tx } = makeDb();
  let reads = 0;
  tx.taskCreationRequest.findUnique = async () => {
    reads++;
    return { payloadHash, task };
  };
  assert.equal(await createTask({
    body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: key,
  }, db), task);
  assert.equal(reads, 1);

  tx.taskCreationRequest.findUnique = async () => ({ payloadHash: "different", task });
  await assert.rejects(
    createTask({ body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: key }, db),
    failure("IDEMPOTENCY_KEY_CONFLICT", 409),
  );
  tx.taskCreationRequest.findUnique = async () => ({ payloadHash, task: null });
  await assert.rejects(
    createTask({ body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: key }, db),
    failure("IDEMPOTENCY_RESULT_UNAVAILABLE", 409),
  );
});

test("idempotency keys validate bounds and fresh requests persist their result", async () => {
  const { db, tx } = makeDb();
  for (const idempotencyKey of ["", "  ", "x".repeat(256), 1]) {
    await assert.rejects(
      createTask({ body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey }, db),
      failure("VALIDATION_ERROR"),
    );
  }
  let requestData;
  let requestUpdate;
  tx.taskCreationRequest.create = async ({ data }) => {
    requestData = data;
    return { id: "created-request" };
  };
  tx.taskCreationRequest.update = async (args) => { requestUpdate = args; };
  const result = await createTask({
    body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: "new-key",
  }, db);
  assert.equal(result, task);
  assert.equal(requestData.key, "new-key");
  assert.equal(requestData.userId, ownerId);
  assert.equal(requestUpdate.data.taskId, task.id);
});

test("idempotency unique races replay a winner and report an in-progress request", async () => {
  const key = "racing-key";
  const { db, tx } = makeDb();
  const normalized = {
    projectId,
    title: "Test task",
    description: null,
    priority: "MEDIUM",
    dueDate: null,
    timeEstimate: null,
    assigneeId: null,
  };
  const payloadHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  let lookups = 0;
  tx.taskCreationRequest.findUnique = async () => {
    lookups++;
    return lookups === 1 ? null : { payloadHash, task };
  };
  tx.taskCreationRequest.create = async () => { throw { code: "P2002" }; };
  assert.equal(await createTask({
    body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: key,
  }, db), task);

  tx.taskCreationRequest.findUnique = async () => null;
  await assert.rejects(
    createTask({ body, userId: ownerId, projectAccess: projectAccess(), idempotencyKey: key }, db),
    failure("IDEMPOTENCY_REQUEST_IN_PROGRESS", 409),
  );
});

test("task listing functions apply project, membership, and active-user scopes", async () => {
  const { db } = makeDb();
  const queries = {};
  db.task.findMany = async (args) => { queries.tasks = args; return [task]; };
  db.project.findMany = async (args) => { queries.projects = args; return [project]; };
  db.projectMember.findMany = async (args) => { queries.members = args; return []; };
  assert.deepEqual(await listProjectTasks(projectId, db), [task]);
  assert.deepEqual(await listAccessibleProjects(ownerId, db), [project]);
  assert.deepEqual(await listProjectMembers(projectId, db), []);
  assert.equal(queries.tasks.where.projectId, projectId);
  assert.deepEqual(queries.projects.where.OR, [
    { ownerId },
    { members: { some: { userId: ownerId } } },
  ]);
  assert.equal(queries.members.where.user.active, true);
});

function statusDb({ current = task, permission = { userId: ownerId }, blockerCount = 0, updateCount = 1 } = {}) {
  const { db, tx } = makeDb();
  tx.task.findUnique = async () => current;
  tx.project.findUnique = async () => project;
  tx.projectMember.findUnique = async () => permission;
  tx.taskDependency.count = async () => blockerCount;
  tx.task.updateMany = async () => ({ count: updateCount });
  return { db, tx };
}

test("status change validates task, permission, dependencies, and allowed transitions", async () => {
  const { db } = statusDb();
  await assert.rejects(
    changeTaskStatus({ taskId, userId: ownerId, status: "INVALID" }, db),
    failure("VALIDATION_ERROR"),
  );

  let state = statusDb({ current: null });
  await assert.rejects(
    changeTaskStatus({ taskId, userId: ownerId, status: "IN_PROGRESS" }, state.db),
    failure("NOT_FOUND", 404),
  );

  state = statusDb({ current: task, permission: null });
  await assert.rejects(
    changeTaskStatus({ taskId, userId: memberId, status: "IN_PROGRESS" }, state.db),
    failure("FORBIDDEN", 403),
  );

  state = statusDb({ current: { ...task, status: "IN_REVIEW" }, blockerCount: 1 });
  await assert.rejects(
    changeTaskStatus({ taskId, userId: ownerId, status: "DONE" }, state.db),
    failure("TASK_BLOCKED", 409),
  );

  state = statusDb();
  await assert.rejects(
    changeTaskStatus({ taskId, userId: ownerId, status: "DONE" }, state.db),
    failure("INVALID_STATUS_TRANSITION"),
  );
});

test("status change supports unassigned return, concurrency detection, and successful updates", async (t) => {
  const state = statusDb({ current: { ...task, status: "IN_PROGRESS" }, updateCount: 0 });
  await assert.rejects(
    changeTaskStatus({ taskId, userId: ownerId, status: "TODO" }, state.db),
    failure("STATUS_CHANGED_CONCURRENTLY", 409),
  );

  const success = statusDb({ current: { ...task, status: "IN_PROGRESS" } });
  t.mock.method(notificationService, "notifyTaskStatusChanged", async () => null);
  const updated = await changeTaskStatus(
    { taskId, userId: ownerId, status: "TODO" },
    success.db,
  );
  assert.equal(updated.status, "IN_PROGRESS");
});

test("task updates reject invalid fields, completed tasks, and missing records", async () => {
  const { db, tx } = makeDb();
  for (const invalidBody of [null, [], {}, { assigneeId: memberId }, { title: " " }, { title: "x".repeat(201) }, { description: 1 }, { description: "x".repeat(2001) }, { priority: "URGENT" }, { dueDate: "2026-02-30" }, { timeEstimate: -1 }, { timeEstimate: Infinity }]) {
    await assert.rejects(updateTask({ taskId, userId: ownerId, body: invalidBody }, db), failure("VALIDATION_ERROR"));
  }
  tx.task.findUnique = async () => null;
  await assert.rejects(
    updateTask({ taskId, userId: ownerId, body: { title: "Changed" } }, db),
    failure("NOT_FOUND", 404),
  );
  tx.task.findUnique = async () => ({ ...task, status: "DONE" });
  await assert.rejects(
    updateTask({ taskId, userId: ownerId, body: { title: "Changed" } }, db),
    failure("TASK_COMPLETED", 409),
  );
  tx.task.findUnique = async () => task;
  tx.project.findUnique = async () => ({ ...project, ownerId: memberId });
  await assert.rejects(
    updateTask({ taskId, userId: ownerId, body: { title: "Changed" } }, db),
    failure("FORBIDDEN", 403),
  );
});

test("task updates normalize values, record actual changes, and handle races", async () => {
  const { db, tx } = makeDb();
  let update;
  let activities;
  tx.task.updateMany = async (args) => { update = args; return { count: 1 }; };
  tx.activityLog.createMany = async (args) => { activities = args.data; };
  const result = await updateTask({
    taskId,
    userId: ownerId,
    body: {
      title: " Updated ",
      description: null,
      dueDate: "2026-06-07",
      timeEstimate: "",
      priority: "HIGH",
    },
  }, db);
  assert.equal(result, task);
  assert.equal(update.data.title, "Updated");
  assert.equal(update.data.description, null);
  assert.equal(update.data.dueDate.toISOString(), "2026-06-07T00:00:00.000Z");
  assert.equal(update.data.timeEstimate, null);
  assert.equal(activities.length, 3);
  assert.deepEqual(activities.map(({ field }) => field), ["title", "priority", "dueDate"]);

  tx.task.updateMany = async () => ({ count: 0 });
  let reads = 0;
  tx.task.findUnique = async () => {
    reads++;
    return reads < 3 ? task : { id: taskId, status: "DONE" };
  };
  await assert.rejects(
    updateTask({ taskId, userId: ownerId, body: { title: "Changed" } }, db),
    failure("TASK_COMPLETED", 409),
  );
  reads = 0;
  tx.task.findUnique = async () => {
    reads++;
    return reads < 3 ? task : null;
  };
  await assert.rejects(
    updateTask({ taskId, userId: ownerId, body: { title: "Changed" } }, db),
    failure("NOT_FOUND", 404),
  );
});

function assignDb({ assigned = null, owner = ownerId, assignee = { id: memberId, active: true }, member = { userId: memberId } } = {}) {
  const { db, tx } = makeDb();
  tx.task.findUnique = async () => ({ id: taskId, projectId, assigneeId: assigned });
  tx.project.findUnique = async () => ({ ...project, ownerId: owner });
  tx.user.findUnique = async () => assignee;
  tx.projectMember.findUnique = async () => member;
  return { db, tx };
}

test("task assignment validates payload, task, owner, and active membership", async () => {
  const { db } = assignDb();
  for (const invalidBody of [null, [], {}, { assigneeId: memberId, other: true }, { assigneeId: "bad" }]) {
    await assert.rejects(assignTask({ taskId, userId: ownerId, body: invalidBody }, db), failure("VALIDATION_ERROR"));
  }
  let state = assignDb();
  state.tx.task.findUnique = async () => null;
  await assert.rejects(
    assignTask({ taskId, userId: ownerId, body: { assigneeId: memberId } }, state.db),
    failure("NOT_FOUND", 404),
  );
  state = assignDb({ owner: memberId });
  await assert.rejects(
    assignTask({ taskId, userId: ownerId, body: { assigneeId: memberId } }, state.db),
    failure("FORBIDDEN", 403),
  );
  for (const options of [{ assignee: null }, { assignee: { id: memberId, active: false } }, { member: null }]) {
    state = assignDb(options);
    await assert.rejects(
      assignTask({ taskId, userId: ownerId, body: { assigneeId: memberId } }, state.db),
      failure("VALIDATION_ERROR"),
    );
  }
});

test("task assignment is idempotent for the same member and logs a changed assignment", async (t) => {
  const same = assignDb({ assigned: memberId });
  const existing = { ...task, assigneeId: memberId };
  same.tx.task.findUnique = async () => existing;
  assert.equal(
    await assignTask({ taskId, userId: ownerId, body: { assigneeId: memberId } }, same.db),
    existing,
  );

  const changed = assignDb();
  let update;
  let activity;
  changed.tx.task.update = async (args) => { update = args; return { ...task, assigneeId: memberId }; };
  changed.tx.activityLog.createMany = async (args) => { activity = args.data; };
  t.mock.method(notificationService, "notifyTaskAssigned", async () => null);
  const result = await assignTask({
    taskId,
    userId: ownerId,
    body: { assigneeId: memberId },
  }, changed.db);
  assert.equal(result.assigneeId, memberId);
  assert.equal(update.data.assigneeId, memberId);
  assert.equal(activity[0].field, "assigneeId");
  assert.equal(activity[0].oldValue, Prisma.JsonNull);
});
