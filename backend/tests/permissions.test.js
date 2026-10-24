// Issue #3 (role-based access control) tests: F1-REQ-07/09, F4-REQ-07,
// F8-REQ-02/05, SEC-02, SRS 6.5. Covers TC-05 and TC-16.
//
// The project/task/admin endpoints themselves belong to F2, F4, F5 and F8, so
// this file mounts stand-in routes guarded by the real permission checks.
// Each handler performs a real database change, so the tests can prove that a
// rejected request changes nothing.
//
// Uses the database in DATABASE_URL and deletes only the rows it created.

import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: express } = await import("express");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
const { requireAuth, requireRole } = await import("../src/middleware/auth.js");
const {
  requireProjectMember,
  requireProjectOwner,
  requireTaskMember,
  requireTaskProjectOwner,
  requireTaskStatusChange,
} = await import("../src/middleware/permissions.js");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `rbac-${RUN_ID}-${label}@test.example.com`;

// ---- Stand-in routes, one per protected action in SRS 6.5 ----------------

const app = express();
app.use(express.json());
const ok = (res, body = {}) => res.status(200).json(body);

app.get("/projects/:projectId", requireAuth, requireProjectMember(), (req, res) =>
  ok(res, { project: req.project }),
);
app.post("/projects/:projectId/archive", requireAuth, requireProjectOwner(), async (req, res) => {
  await prisma.project.update({ where: { id: req.project.id }, data: { archived: true } });
  ok(res);
});
app.post("/projects/:projectId/members", requireAuth, requireProjectOwner(), async (req, res) => {
  await prisma.projectMember.create({
    data: { projectId: req.project.id, userId: req.body.userId },
  });
  ok(res);
});
app.patch("/projects/:projectId/members/:userId", requireAuth, requireProjectOwner(), async (req, res) => {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: req.project.id, userId: req.params.userId } },
    data: { projectRole: req.body.projectRole },
  });
  ok(res);
});
app.delete("/projects/:projectId/members/:userId", requireAuth, requireProjectOwner(), async (req, res) => {
  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: req.project.id, userId: req.params.userId } },
  });
  ok(res);
});
app.post("/tasks", requireAuth, requireProjectMember(), (req, res) => ok(res, { projectId: req.project.id }));
app.get("/tasks/:taskId", requireAuth, requireTaskMember(), (req, res) => ok(res, { task: req.task }));
app.patch("/tasks/:taskId/assignee", requireAuth, requireTaskProjectOwner(), async (req, res) => {
  await prisma.task.update({ where: { id: req.task.id }, data: { assigneeId: req.body.assigneeId } });
  ok(res);
});
app.patch("/tasks/:taskId/status", requireAuth, requireTaskStatusChange(), async (req, res) => {
  await prisma.task.update({ where: { id: req.task.id }, data: { status: req.body.status } });
  ok(res);
});
app.patch("/admin/users/:userId/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.user.update({ where: { id: req.params.userId }, data: { role: req.body.role } });
  ok(res);
});
app.post("/admin/users/:userId/deactivate", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.user.update({ where: { id: req.params.userId }, data: { active: false } });
  ok(res);
});
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Unexpected error" } });
});

// ---- Fixtures ----------------------------------------------------------------

let server;
let base;
const users = {};
const tokens = {};
let projectA;
let projectB;
let task;

async function makeUser(label, role = "MEMBER") {
  const user = await prisma.user.create({
    data: { name: label, email: emailFor(label), passwordHash: "x".repeat(60), role },
  });
  users[label] = user;
  tokens[label] = signToken(user);
  return user;
}

async function call(path, { method = "GET", body, as } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (as) headers.Authorization = `Bearer ${tokens[as]}`;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const expectForbidden = (response, label) => {
  assert.equal(response.status, 403, label);
  assert.equal(response.body.error.code, "FORBIDDEN", label);
};

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Project A: "owner" created it (Project.ownerId), so is its only Owner.
  // "coowner" is a member whose membership row is marked "Owner"; that must
  // NOT grant Owner rights. "member" and "assignee" are ordinary members.
  // "systemOwner" has system role OWNER but no part in project A.
  // "admin" has system role ADMIN but no part in project A.
  await makeUser("owner");
  await makeUser("coowner");
  await makeUser("member");
  await makeUser("assignee");
  await makeUser("newcomer");
  await makeUser("systemOwner", "OWNER");
  await makeUser("admin", "ADMIN");
  await makeUser("other");

  projectA = await prisma.project.create({
    data: { name: `A-${RUN_ID}`, ownerId: users.owner.id },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: projectA.id, userId: users.owner.id, projectRole: "Owner" },
      { projectId: projectA.id, userId: users.coowner.id, projectRole: "Owner" },
      { projectId: projectA.id, userId: users.member.id },
      { projectId: projectA.id, userId: users.assignee.id },
    ],
  });
  // Project B belongs to "systemOwner"; "owner" of A has no part in it.
  projectB = await prisma.project.create({
    data: { name: `B-${RUN_ID}`, ownerId: users.systemOwner.id },
  });
  task = await prisma.task.create({
    data: {
      projectId: projectA.id,
      title: "RBAC test task",
      priority: "MEDIUM",
      assigneeId: users.assignee.id,
    },
  });
});

after(async () => {
  const projectIds = [projectA?.id, projectB?.id].filter(Boolean);
  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `rbac-${RUN_ID}-` } } });
  await prisma.$disconnect();
  server.close();
});

const currentTask = () => prisma.task.findUnique({ where: { id: task.id } });
const membership = (userId) =>
  prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: projectA.id, userId } },
  });

// ---- Tests -------------------------------------------------------------------

describe("Every user has one system role (F1-REQ-07)", () => {
  test("each user has exactly one of Member, Owner or Admin", async () => {
    const rows = await prisma.user.findMany({
      where: { email: { startsWith: `rbac-${RUN_ID}-` } },
      select: { role: true },
    });
    assert.ok(rows.length > 0);
    for (const { role } of rows) assert.ok(["MEMBER", "OWNER", "ADMIN"].includes(role));
  });

  test("the role is re-read on every request: a promotion or demotion applies at once", async () => {
    const path = `/admin/users/${users.other.id}/role`;
    expectForbidden(await call(path, { method: "PATCH", body: { role: "MEMBER" }, as: "member" }), "before");

    await prisma.user.update({ where: { id: users.member.id }, data: { role: "ADMIN" } });
    const promoted = await call(path, { method: "PATCH", body: { role: "MEMBER" }, as: "member" });
    assert.equal(promoted.status, 200, "same token, now allowed");

    await prisma.user.update({ where: { id: users.member.id }, data: { role: "MEMBER" } });
    expectForbidden(await call(path, { method: "PATCH", body: { role: "MEMBER" }, as: "member" }), "after");
  });

  test("a deactivated user's existing token stops working immediately (F8-REQ-02)", async () => {
    assert.equal((await call(`/projects/${projectA.id}`, { as: "member" })).status, 200);
    await prisma.user.update({ where: { id: users.member.id }, data: { active: false } });
    const response = await call(`/projects/${projectA.id}`, { as: "member" });
    assert.equal(response.status, 401);
    await prisma.user.update({ where: { id: users.member.id }, data: { active: true } });
  });
});

describe("Unauthenticated and unknown resources", () => {
  test("no token is a 401, checked before any permission", async () => {
    assert.equal((await call(`/projects/${projectA.id}/archive`, { method: "POST" })).status, 401);
  });

  test("an unknown or malformed ID is a 404, not a 500", async () => {
    assert.equal((await call(`/projects/${randomUUID()}`, { as: "owner" })).status, 404);
    assert.equal((await call(`/projects/not-a-uuid`, { as: "owner" })).status, 404);
    assert.equal((await call(`/tasks/${randomUUID()}`, { as: "owner" })).status, 404);
  });
});

describe("Project-owner actions (SRS 6.5, F4-REQ-07, TC-05, TC-16)", () => {
  test("TC-05: a Member calling an Owner-only endpoint gets 403 and nothing happens", async () => {
    expectForbidden(await call(`/projects/${projectA.id}/archive`, { method: "POST", as: "member" }));
    const project = await prisma.project.findUnique({ where: { id: projectA.id } });
    assert.equal(project.archived, false);
  });

  test("TC-16: a non-Owner member cannot invite, remove or re-role members", async () => {
    expectForbidden(
      await call(`/projects/${projectA.id}/members`, {
        method: "POST",
        body: { userId: users.newcomer.id },
        as: "member",
      }),
      "invite",
    );
    assert.equal(await membership(users.newcomer.id), null, "nobody was added");

    expectForbidden(
      await call(`/projects/${projectA.id}/members/${users.assignee.id}`, {
        method: "DELETE",
        as: "member",
      }),
      "remove",
    );
    assert.ok(await membership(users.assignee.id), "nobody was removed");

    expectForbidden(
      await call(`/projects/${projectA.id}/members/${users.member.id}`, {
        method: "PATCH",
        body: { projectRole: "Owner" },
        as: "member",
      }),
      "self-promotion",
    );
    assert.equal((await membership(users.member.id)).projectRole, "Member");
  });

  test("the project's Owner can invite, re-role and remove members", async () => {
    const invite = await call(`/projects/${projectA.id}/members`, {
      method: "POST",
      body: { userId: users.newcomer.id },
      as: "owner",
    });
    assert.equal(invite.status, 200);
    assert.ok(await membership(users.newcomer.id));

    const rerole = await call(`/projects/${projectA.id}/members/${users.newcomer.id}`, {
      method: "PATCH",
      body: { projectRole: "Member" },
      as: "owner",
    });
    assert.equal(rerole.status, 200);

    const remove = await call(`/projects/${projectA.id}/members/${users.newcomer.id}`, {
      method: "DELETE",
      as: "owner",
    });
    assert.equal(remove.status, 200);
    assert.equal(await membership(users.newcomer.id), null);
  });

  test("single Owner: a membership marked \"Owner\" does not grant Owner rights", async () => {
    expectForbidden(
      await call(`/projects/${projectA.id}/members`, {
        method: "POST",
        body: { userId: users.newcomer.id },
        as: "coowner",
      }),
      "invite",
    );
    assert.equal(await membership(users.newcomer.id), null, "nobody was added");
    expectForbidden(
      await call(`/projects/${projectA.id}/archive`, { method: "POST", as: "coowner" }),
      "archive",
    );
    expectForbidden(
      await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body: { assigneeId: users.coowner.id },
        as: "coowner",
      }),
      "assign",
    );
    const project = await prisma.project.findUnique({ where: { id: projectA.id } });
    assert.equal(project.archived, false);
    assert.equal((await currentTask()).assigneeId, users.assignee.id);
    // Still an ordinary member: can view the project.
    assert.equal((await call(`/projects/${projectA.id}`, { as: "coowner" })).status, 200);
  });

  test("a system role of Owner or Admin does not grant rights in someone else's project", async () => {
    for (const as of ["systemOwner", "admin"]) {
      expectForbidden(await call(`/projects/${projectA.id}`, { as }), `${as} view`);
      expectForbidden(await call(`/projects/${projectA.id}/archive`, { method: "POST", as }), `${as} archive`);
    }
    const project = await prisma.project.findUnique({ where: { id: projectA.id } });
    assert.equal(project.archived, false);
  });

  test("cross-project: the Owner of project A has no rights in project B", async () => {
    expectForbidden(await call(`/projects/${projectB.id}`, { as: "owner" }), "view B");
    expectForbidden(await call(`/projects/${projectB.id}/archive`, { method: "POST", as: "owner" }), "archive B");
    expectForbidden(
      await call("/tasks", { method: "POST", body: { projectId: projectB.id }, as: "owner" }),
      "create task in B",
    );
    const project = await prisma.project.findUnique({ where: { id: projectB.id } });
    assert.equal(project.archived, false);
  });

  test("members can view their project and create tasks in it; non-members cannot", async () => {
    assert.equal((await call(`/projects/${projectA.id}`, { as: "member" })).status, 200);
    assert.equal(
      (await call("/tasks", { method: "POST", body: { projectId: projectA.id }, as: "member" })).status,
      200,
    );
    expectForbidden(await call("/tasks", { method: "POST", body: { projectId: projectA.id }, as: "other" }));
  });
});

describe("Task permissions (SRS 6.5)", () => {
  test("only the project Owner can assign a task", async () => {
    expectForbidden(
      await call(`/tasks/${task.id}/assignee`, {
        method: "PATCH",
        body: { assigneeId: users.member.id },
        as: "member",
      }),
    );
    assert.equal((await currentTask()).assigneeId, users.assignee.id, "assignment unchanged");

    const response = await call(`/tasks/${task.id}/assignee`, {
      method: "PATCH",
      body: { assigneeId: users.assignee.id },
      as: "owner",
    });
    assert.equal(response.status, 200);
  });

  test("a member who is not the assignee cannot change the task's status", async () => {
    expectForbidden(
      await call(`/tasks/${task.id}/status`, { method: "PATCH", body: { status: "IN_PROGRESS" }, as: "member" }),
    );
    assert.equal((await currentTask()).status, "TODO", "status unchanged");
  });

  test("outsiders, including Admins, cannot view or change the task", async () => {
    for (const as of ["other", "admin"]) {
      expectForbidden(await call(`/tasks/${task.id}`, { as }), `${as} view`);
      expectForbidden(
        await call(`/tasks/${task.id}/status`, { method: "PATCH", body: { status: "DONE" }, as }),
        `${as} status`,
      );
    }
    assert.equal((await currentTask()).status, "TODO");
  });

  test("the assignee can change the status", async () => {
    const response = await call(`/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "assignee",
    });
    assert.equal(response.status, 200);
    assert.equal((await currentTask()).status, "IN_PROGRESS");
  });

  test("an assignee removed from the project can no longer change the task's status", async () => {
    const leftover = await prisma.task.create({
      data: { projectId: projectA.id, title: "Leftover assignment", priority: "LOW", assigneeId: users.newcomer.id },
    });
    await prisma.projectMember.create({ data: { projectId: projectA.id, userId: users.newcomer.id } });
    const whileMember = await call(`/tasks/${leftover.id}/status`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      as: "newcomer",
    });
    assert.equal(whileMember.status, 200, "allowed while still a member");

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: projectA.id, userId: users.newcomer.id } },
    });
    expectForbidden(
      await call(`/tasks/${leftover.id}/status`, { method: "PATCH", body: { status: "DONE" }, as: "newcomer" }),
    );
    const after = await prisma.task.findUnique({ where: { id: leftover.id } });
    assert.equal(after.status, "IN_PROGRESS", "status unchanged");
    assert.equal(after.assigneeId, users.newcomer.id, "still assigned, but no longer allowed");
  });

  test("the project Owner can change the status", async () => {
    const response = await call(`/tasks/${task.id}/status`, {
      method: "PATCH",
      body: { status: "IN_REVIEW" },
      as: "owner",
    });
    assert.equal(response.status, 200);
    assert.equal((await currentTask()).status, "IN_REVIEW");
  });
});

describe("Administrator-only actions (SRS 6.5, F8-REQ-05)", () => {
  test("non-Admins, including system Owners and project Owners, get 403 and nothing changes", async () => {
    for (const as of ["member", "owner", "systemOwner"]) {
      expectForbidden(
        await call(`/admin/users/${users.other.id}/role`, { method: "PATCH", body: { role: "ADMIN" }, as }),
        `${as} change role`,
      );
      expectForbidden(
        await call(`/admin/users/${users.other.id}/deactivate`, { method: "POST", as }),
        `${as} deactivate`,
      );
    }
    const other = await prisma.user.findUnique({ where: { id: users.other.id } });
    assert.equal(other.role, "MEMBER");
    assert.equal(other.active, true);
  });

  test("an Admin can change a user's role and deactivate them", async () => {
    const rerole = await call(`/admin/users/${users.other.id}/role`, {
      method: "PATCH",
      body: { role: "OWNER" },
      as: "admin",
    });
    assert.equal(rerole.status, 200);
    const deactivate = await call(`/admin/users/${users.other.id}/deactivate`, {
      method: "POST",
      as: "admin",
    });
    assert.equal(deactivate.status, 200);

    const other = await prisma.user.findUnique({ where: { id: users.other.id } });
    assert.equal(other.role, "OWNER");
    assert.equal(other.active, false);
  });
});
