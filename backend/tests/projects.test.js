// F4-REQ-01: project creation API integration tests against DATABASE_URL.
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
const emailFor = (label) => `f4-${RUN_ID}-${label}@test.example.com`;
const PASSWORD_HASH = "x".repeat(60);
const PROJECT_PREFIX = `f4-${RUN_ID}-`;

let server;
let base;
const users = {};
const tokens = {};

async function makeUser(label) {
  const user = await prisma.user.create({
    data: {
      name: label,
      email: emailFor(label),
      passwordHash: PASSWORD_HASH,
    },
  });
  users[label] = user;
  tokens[label] = signToken(user);
  return user;
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;

  await makeUser("owner");
  await makeUser("other");
});

after(async () => {
  const projects = await prisma.project.findMany({
    where: { name: { startsWith: PROJECT_PREFIX } },
    select: { id: true },
  });
  const projectIds = projects.map(({ id }) => id);
  await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `f4-${RUN_ID}-` } } });
  await prisma.$disconnect();
  server.close();
});

async function call(path, { method = "POST", body, token, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const projectName = (label) => `${PROJECT_PREFIX}${label}`;

describe("project creation (F4-REQ-01, F4-REQ-07, TC-14)", () => {
  test("creates and persists a project with its creator as Owner and first member", async () => {
    const response = await call("/projects", {
      body: { name: `  ${projectName("tc14")}  ` },
      token: tokens.owner,
    });

    assert.equal(response.status, 201);
    const { project } = response.body;
    assert.equal(project.name, projectName("tc14"));
    assert.equal(project.ownerId, users.owner.id);
    assert.deepEqual(project.members, [{ userId: users.owner.id, projectRole: "Owner" }]);

    const stored = await prisma.project.findUnique({ where: { id: project.id } });
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: users.owner.id } },
    });
    assert.equal(stored.ownerId, users.owner.id);
    assert.equal(membership.projectRole, "Owner");
  });

  test("rejects missing, blank, non-string and over-limit project names", async () => {
    const invalidBodies = [
      undefined,
      {},
      { name: "" },
      { name: "   " },
      { name: 42 },
      { name: "x".repeat(151) },
    ];

    for (const body of invalidBodies) {
      const response = await call("/projects", { body, token: tokens.owner });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
    }

    const boundary = await call("/projects", {
      body: { name: projectName("x".repeat(150 - PROJECT_PREFIX.length)) },
      token: tokens.owner,
    });
    assert.equal(boundary.status, 201, "150-character names are accepted");
  });

  test("rejects duplicate names for the same Owner but allows another Owner", async () => {
    const name = projectName("duplicate");
    const first = await call("/projects", { body: { name }, token: tokens.owner });
    assert.equal(first.status, 201);

    const duplicate = await call("/projects", {
      body: { name: ` ${name} ` },
      token: tokens.owner,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "PROJECT_NAME_IN_USE");

    const otherOwnerProject = await call("/projects", {
      body: { name },
      token: tokens.other,
    });
    assert.equal(otherOwnerProject.status, 201);
    assert.notEqual(otherOwnerProject.body.project.ownerId, first.body.project.ownerId);
  });

  test("the owner cannot be supplied or changed in the request body", async () => {
    const response = await call("/projects", {
      body: { name: projectName("owner-source"), ownerId: users.other.id },
      token: tokens.owner,
    });
    assert.equal(response.status, 400);

    const created = await call("/projects", {
      body: { name: projectName("owner-source") },
      token: tokens.owner,
    });
    assert.equal(created.body.project.ownerId, users.owner.id);
  });

  test("returns only the authenticated user's projects", async () => {
    const own = await call("/projects", { method: "GET", token: tokens.owner });
    const other = await call("/projects", { method: "GET", token: tokens.other });
    assert.equal(own.status, 200);
    assert.ok(own.body.projects.some((project) => project.name === projectName("tc14")));
    assert.ok(other.body.projects.every((project) => project.ownerId === users.other.id));
  });

  test("rejects missing, invalid and expired JWTs with 401", async () => {
    const expired = jwt.sign({ sub: users.owner.id }, process.env.JWT_SECRET, { expiresIn: -10 });
    for (const token of [undefined, "invalid-token", expired]) {
      const response = await call("/projects", { body: { name: projectName("unauth") }, token });
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, "UNAUTHENTICATED");
    }
  });
});
