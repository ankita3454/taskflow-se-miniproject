// F4-REQ-02/03/04/07: invitation API integration tests against DATABASE_URL.
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
const emailFor = (label) => `f4inv-${RUN_ID}-${label}@test.example.com`;
const PROJECT_NAME = `f4inv-${RUN_ID}-project`;
const PASSWORD_HASH = "x".repeat(60);

let server;
let base;
let project;
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

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;

  await makeUser("owner");
  await makeUser("inbox");
  await makeUser("invitee");
  await makeUser("declinee");
  await makeUser("other");
  project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      ownerId: users.owner.id,
      members: { create: { userId: users.owner.id, projectRole: "Owner" } },
    },
  });
});

after(async () => {
  await prisma.projectInvitation.deleteMany({
    where: { projectId: project.id },
  });
  await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `f4inv-${RUN_ID}-` } } });
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

async function invite(email, as = "owner") {
  return call(`/projects/${project.id}/invitations`, {
    body: { email },
    token: tokens[as],
  });
}

describe("project invitations (F4-REQ-02/03/04/07)", () => {
  test("an Owner creates a persisted invitation visible in the invitee inbox", async () => {
    const response = await invite(` ${users.inbox.email.toUpperCase()} `);
    assert.equal(response.status, 201);
    assert.equal(response.body.invitation.invitedEmail, users.invitee.email);
    assert.equal(response.body.invitation.status, "PENDING");

    const stored = await prisma.projectInvitation.findUnique({
      where: { id: response.body.invitation.id },
    });
    assert.equal(stored.projectId, project.id);
    assert.equal(stored.invitedById, users.owner.id);

    const inbox = await call("/invitations", { method: "GET", token: tokens.inbox });
    assert.equal(inbox.status, 200);
    assert.ok(inbox.body.invitations.some(({ id }) => id === stored.id));
    const unrelatedInbox = await call("/invitations", {
      method: "GET",
      token: tokens.other,
    });
    assert.ok(unrelatedInbox.body.invitations.every(({ id }) => id !== stored.id));
  });

  test("invalid email input is rejected and creates no invitation", async () => {
    const beforeCount = await prisma.projectInvitation.count({ where: { projectId: project.id } });
    for (const email of ["", "not-an-email", "missing-domain@example", "x".repeat(146) + "@x.co"]) {
      const response = await invite(email);
      assert.equal(response.status, 400, email);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
    }
    assert.equal(
      await prisma.projectInvitation.count({ where: { projectId: project.id } }),
      beforeCount,
    );
  });

  test("only the project Owner can invite users", async () => {
    const response = await invite(emailFor("outsider"), "other");
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "FORBIDDEN");
    assert.equal(
      await prisma.projectInvitation.count({
        where: { projectId: project.id, invitedEmail: emailFor("outsider") },
      }),
      0,
    );
  });

  test("missing, invalid and expired JWTs receive 401", async () => {
    const expired = jwt.sign({ sub: users.owner.id }, process.env.JWT_SECRET, { expiresIn: -10 });
    for (const token of [undefined, "not-a-jwt", expired]) {
      const response = await call(`/projects/${project.id}/invitations`, {
        body: { email: emailFor("unauthenticated") },
        token,
      });
      assert.equal(response.status, 401);
    }
  });

  test("only the intended invitee can accept; acceptance grants Member membership", async () => {
    const created = await invite(users.invitee.email);
    assert.equal(created.status, 201);
    const invitationId = created.body.invitation.id;

    const wrongUser = await call(`/invitations/${invitationId}/accept`, {
      token: tokens.other,
    });
    assert.equal(wrongUser.status, 403);
    const wrongDecline = await call(`/invitations/${invitationId}/decline`, {
      token: tokens.other,
    });
    assert.equal(wrongDecline.status, 403);

    const accepted = await call(`/invitations/${invitationId}/accept`, {
      token: tokens.invitee,
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.invitation.status, "ACCEPTED");
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: users.invitee.id } },
    });
    assert.equal(membership.projectRole, "Member");

    const repeated = await call(`/invitations/${invitationId}/accept`, {
      token: tokens.invitee,
    });
    assert.equal(repeated.status, 409);
  });

  test("declining changes invitation status without adding membership", async () => {
    const created = await invite(users.declinee.email);
    assert.equal(created.status, 201);

    const declined = await call(`/invitations/${created.body.invitation.id}/decline`, {
      token: tokens.declinee,
    });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.invitation.status, "DECLINED");
    assert.equal(
      await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: users.declinee.id } },
      }),
      null,
    );
  });
});
