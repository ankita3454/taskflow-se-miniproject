import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
process.env.JWT_SECRET ??= "sprint2-test-only";
process.env.LOGIN_RATE_LIMIT = "3";
const { default: app } = await import("../src/app.js");
const { default: db } = await import("../src/repositories/prisma.js");
const { signToken } = await import("../src/utils/jwt.js");
const { createLoginLimiter } = await import("../src/sprint2/security.js");
let server, base, admin, member, adminToken, memberToken;
const marker = randomUUID();
before(async () => {
  admin = await db.user.create({
    data: {
      name: "S2 Admin",
      email: `a-${marker}@example.test`,
      passwordHash: "not-a-login-hash",
      role: "ADMIN",
    },
  });
  member = await db.user.create({
    data: {
      name: "S2 Member",
      email: `m-${marker}@example.test`,
      passwordHash: "not-a-login-hash",
    },
  });
  adminToken = signToken(admin);
  memberToken = signToken(member);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: admin.id }, { targetId: member.id }] },
  });
  await db.user.deleteMany({ where: { id: { in: [admin.id, member.id] } } });
  await db.$disconnect();
  await new Promise((r) => server.close(r));
});
async function call(path, { token = adminToken, method = "GET", body } = {}) {
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
    headers: r.headers,
    data: await r.json().catch(() => null),
  };
}
test("admin list is authenticated, role-protected and excludes internal fields", async () => {
  for (const token of [
    null,
    "bad",
    jwt.sign({ sub: admin.id }, process.env.JWT_SECRET, { expiresIn: -1 }),
  ])
    assert.equal((await call("/admin/users", { token })).status, 401);
  assert.equal(
    (await call("/admin/users", { token: memberToken })).status,
    403,
  );
  const r = await call("/admin/users");
  assert.equal(r.status, 200);
  for (const user of r.data.users) {
    assert.deepEqual(Object.keys(user).sort(), [
      "active",
      "email",
      "id",
      "name",
      "role",
    ]);
  }
});
test("deactivation invalidates old sessions permanently across reactivation", async () => {
  assert.equal(
    (
      await call(`/admin/users/${member.id}`, {
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal((await call("/auth/me", { token: memberToken })).status, 401);
  assert.equal(
    (
      await call(`/admin/users/${member.id}`, {
        method: "PATCH",
        body: { active: true },
      })
    ).status,
    200,
  );
  assert.equal((await call("/auth/me", { token: memberToken })).status, 401);
  const refreshed = signToken(
    await db.user.findUnique({ where: { id: member.id } }),
  );
  assert.equal((await call("/auth/me", { token: refreshed })).status, 200);
});
test("role changes and account changes create filtered immutable audit records", async () => {
  await call(`/admin/users/${member.id}`, {
    method: "PATCH",
    body: { role: "OWNER" },
  });
  const r = await call("/admin/audit?event=ROLE_CHANGED");
  assert.equal(r.status, 200);
  const rows = r.data.entries.filter((e) => e.targetId === member.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, admin.id);
  assert.equal((await call("/admin/audit?event=invalid")).status, 400);
  assert.equal((await call("/admin/audit?from=2026-02-30")).status, 400);
  assert.equal(
    (await call("/admin/audit?from=2026-11-05&to=2026-11-01")).status,
    400,
  );
  assert.equal(
    (await call("/admin/audit", { token: memberToken })).status,
    401,
  );
  assert.equal(
    (await call("/admin/audit", { method: "POST", body: { event: "fake" } }))
      .status,
    404,
  );
});
test("self-lockout and malformed admin updates are rejected", async () => {
  assert.equal(
    (
      await call(`/admin/users/${admin.id}`, {
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    409,
  );
  for (const body of [
    {},
    { active: "false" },
    { role: "ROOT" },
    { password: "secret" },
  ])
    assert.equal(
      (await call(`/admin/users/${member.id}`, { method: "PATCH", body }))
        .status,
      400,
    );
});
test("failed login and API rate limiting are recorded without credentials", async () => {
  const email = `unknown-${marker}@example.test`;
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await call("/auth/login", {
          method: "POST",
          token: null,
          body: { email, password: "wrong-secret" },
        })
      ).status,
      401,
    );
  const limited = await call("/auth/login", {
    method: "POST",
    token: null,
    body: { email, password: "wrong-secret" },
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  const malformed = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(
    malformed.status,
    429,
    "Malformed JSON cannot bypass the limiter",
  );
  const audit = await call("/admin/audit?event=LOGIN_FAILED");
  assert.ok(audit.data.entries.length >= 4);
  for (const e of audit.data.entries) assert.equal(e.actorId, null);
  assert.ok(!JSON.stringify(audit.data).includes("wrong-secret"));
});
test("limiter resets after the configured window and fails closed at capacity", async () => {
  let time = 0,
    calls = 0;
  const limiter = createLoginLimiter({
    limit: 2,
    windowMs: 1000,
    now: () => time,
    maxKeys: 1,
  });
  const req = { ip: "127.0.0.1" };
  const response = {
    statusCode: 200,
    status(s) {
      this.statusCode = s;
      return this;
    },
    set() {
      return this;
    },
    json() {
      return this;
    },
  };
  await limiter(req, response, () => calls++);
  await limiter(req, response, () => calls++);
  assert.equal(calls, 2);
  time = 1001;
  await limiter(req, response, () => calls++);
  assert.equal(calls, 3);
  await limiter({ ip: "other" }, response, () => calls++);
  assert.equal(response.statusCode, 429);
  assert.equal(calls, 3);
});
