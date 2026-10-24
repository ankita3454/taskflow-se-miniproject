// F1 (User Accounts and Authentication) acceptance tests.
//
// Runs the real Express app against the real database in DATABASE_URL.
// Every test creates users with e-mails unique to this run, and only those
// users are deleted at the end, so it is safe to run against a dev database.
//
// Run with: npm test   (needs DATABASE_URL, migrations applied)

import "dotenv/config";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-only-secret";

const { default: app } = await import("../src/app.js");
const { default: prisma } = await import("../src/repositories/prisma.js");
const { default: jwt } = await import("jsonwebtoken");

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (label) => `f1-${RUN_ID}-${label}@test.example.com`;
const PASSWORD = "correct-horse-1";

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});

after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: `f1-${RUN_ID}-` } } });
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

async function register(label, overrides = {}) {
  const body = { name: "Test User", email: emailFor(label), password: PASSWORD, ...overrides };
  return call("/register", { body });
}

async function login(email, password = PASSWORD) {
  return call("/login", { body: { email, password } });
}

/** Captures everything written to console.* while fn runs. */
async function captureLogs(fn) {
  const methods = ["log", "info", "warn", "error", "debug"];
  const original = Object.fromEntries(methods.map((m) => [m, console[m]]));
  const lines = [];
  for (const m of methods) console[m] = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join("\n");
}

const expectValidationError = (response, label) => {
  assert.equal(response.status, 400, label);
  assert.equal(response.body.error.code, "VALIDATION_ERROR", label);
};

describe("Issue #1: registration (F1-REQ-01/02/03, SEC-01)", () => {
  test("TC-01: valid registration creates the account and starts a session", async () => {
    const response = await register("tc01");
    assert.equal(response.status, 201);
    assert.ok(response.body.token, "a JWT is returned");
    assert.equal(response.body.user.email, emailFor("tc01"));
    assert.equal(response.body.user.role, "MEMBER");

    const me = await call("/me", { method: "GET", token: response.body.token });
    assert.equal(me.status, 200, "the returned token is a working session");
  });

  test("TC-02: only a bcrypt hash is stored, never the plaintext password", async () => {
    await register("tc02");
    const row = await prisma.user.findUnique({ where: { email: emailFor("tc02") } });
    assert.notEqual(row.passwordHash, PASSWORD);
    assert.match(row.passwordHash, /^\$2[aby]\$12\$.{53}$/, "bcrypt hash, cost 12");
  });

  test("plaintext password never appears in logs during register and login", async () => {
    const secret = "never-log-this-9";
    const output = await captureLogs(async () => {
      await register("nolog", { password: secret });
      await login(emailFor("nolog"), secret);
      await login(emailFor("nolog"), "wrong-password-1");
    });
    assert.ok(!output.includes(secret));
  });

  test("password hash is never returned by the API", async () => {
    const created = await register("nohash");
    const loggedIn = await login(emailFor("nohash"));
    const me = await call("/me", { method: "GET", token: loggedIn.body.token });
    for (const response of [created, loggedIn, me]) {
      assert.equal(response.body.user.passwordHash, undefined);
      assert.ok(!JSON.stringify(response.body).includes("$2"), "no bcrypt string anywhere");
    }
  });

  test("invalid input is rejected server-side with 400", async () => {
    const invalid = {
      "missing name": { name: undefined },
      "blank name": { name: "   " },
      "non-string name": { name: 42 },
      "name over 100 chars": { name: "x".repeat(101) },
      "missing email": { email: undefined },
      "malformed email": { email: "not-an-email" },
      "non-string email": { email: ["a@b.co"] },
      "email over 150 chars": { email: `${"a".repeat(150)}@b.co` },
      "short password": { password: "short" },
      "non-string password": { password: 12345678 },
      "password over 72 bytes": { password: "é".repeat(40) },
    };
    for (const [label, overrides] of Object.entries(invalid)) {
      expectValidationError(await register(`invalid-${label.replace(/\W/g, "")}`, overrides), label);
    }
    expectValidationError(await call("/register", {}), "no body");
    expectValidationError(await call("/register", { raw: "[]" }), "array body");
  });

  test("short password is rejected and nothing is saved", async () => {
    expectValidationError(await register("short", { password: "1234567" }), "7 chars");
    const row = await prisma.user.findUnique({ where: { email: emailFor("short") } });
    assert.equal(row, null);
    assert.equal((await register("eight", { password: "12345678" })).status, 201, "8 chars is enough");
  });

  test("duplicate e-mail (any letter case) is rejected with 409", async () => {
    await register("dup");
    const response = await call("/register", {
      body: { name: "Other", email: ` ${emailFor("dup").toUpperCase()} `, password: PASSWORD },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body.error, { code: "EMAIL_IN_USE", message: "E-mail already in use" });
  });

  test("concurrent duplicate registrations: exactly one 201, the rest 409, no 500", async () => {
    const body = { name: "Race", email: emailFor("race"), password: PASSWORD };
    const results = await Promise.all(Array.from({ length: 10 }, () => call("/register", { body })));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    const rows = await prisma.user.count({ where: { email: emailFor("race") } });
    assert.equal(rows, 1);
  });
});

describe("Issue #2: login, JWT and logout (F1-REQ-04/05/08/10, SEC-04/05)", () => {
  let token;
  let userId;

  before(async () => {
    const response = await register("login");
    userId = response.body.user.id;
  });

  test("TC-03: valid login returns a signed JWT with the user's ID and role", async () => {
    const response = await login(emailFor("login"));
    assert.equal(response.status, 200);
    token = response.body.token;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.sub, userId);
    assert.equal(payload.role, "MEMBER");
  });

  test("TC-03: wrong password and unknown e-mail get the same generic 401", async () => {
    const generic = { code: "INVALID_CREDENTIALS", message: "Invalid e-mail or password" };
    const wrongPassword = await login(emailFor("login"), "wrong-password-1");
    const unknownEmail = await login(emailFor("does-not-exist"));
    for (const response of [wrongPassword, unknownEmail]) {
      assert.equal(response.status, 401);
      assert.deepEqual(response.body.error, generic);
    }
  });

  test("missing or malformed credentials get a controlled 400, never a 500", async () => {
    const cases = {
      "empty body": {},
      "missing password": { email: emailFor("login") },
      "missing email": { password: PASSWORD },
      "non-string email": { email: 5, password: PASSWORD },
      "non-string password": { email: emailFor("login"), password: ["x"] },
      "empty strings": { email: "", password: "" },
    };
    for (const [label, body] of Object.entries(cases)) {
      expectValidationError(await call("/login", { body }), label);
    }
    expectValidationError(await call("/login", {}), "no body");
  });

  test("TC-04: missing, tampered and expired JWTs are rejected with 401", async () => {
    const expired = jwt.sign({ sub: userId, role: "MEMBER" }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });
    const wrongSecret = jwt.sign({ sub: userId, role: "MEMBER" }, "not-the-secret");
    const tokens = {
      missing: undefined,
      tampered: `${token}x`,
      expired,
      "signed with another secret": wrongSecret,
    };
    for (const [label, badToken] of Object.entries(tokens)) {
      const get = await call("/me", { method: "GET", token: badToken });
      const patch = await call("/me", { method: "PATCH", body: { name: "X" }, token: badToken });
      assert.equal(get.status, 401, `GET ${label}`);
      assert.equal(patch.status, 401, `PATCH ${label}`);
    }
  });

  test("logout succeeds for an authenticated user", async () => {
    const response = await call("/logout", { token });
    assert.equal(response.status, 204);
  });

  test("a deactivated user cannot log in", async () => {
    await register("inactive");
    await prisma.user.update({ where: { email: emailFor("inactive") }, data: { active: false } });
    const response = await login(emailFor("inactive"));
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "INVALID_CREDENTIALS");
  });
});

describe("Issue #4: profile view and update (F1-REQ-06, SEC-03)", () => {
  let token;

  before(async () => {
    token = (await register("profile", { name: "Original Name" })).body.token;
  });

  test("a user can view their own profile", async () => {
    const response = await call("/me", { method: "GET", token });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, emailFor("profile"));
    assert.equal(response.body.user.name, "Original Name");
  });

  test("a user can update their own name", async () => {
    const response = await call("/me", { method: "PATCH", body: { name: "  New Name  " }, token });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.name, "New Name");
    const row = await prisma.user.findUnique({ where: { email: emailFor("profile") } });
    assert.equal(row.name, "New Name");
  });

  test("password change: stored as bcrypt, new password works, old one fails", async () => {
    const newPassword = "brand-new-pass-2";
    const response = await call("/me", { method: "PATCH", body: { password: newPassword }, token });
    assert.equal(response.status, 200);

    const row = await prisma.user.findUnique({ where: { email: emailFor("profile") } });
    assert.match(row.passwordHash, /^\$2[aby]\$12\$/);
    assert.notEqual(row.passwordHash, newPassword);

    assert.equal((await login(emailFor("profile"), PASSWORD)).status, 401, "old password");
    assert.equal((await login(emailFor("profile"), newPassword)).status, 200, "new password");
  });

  test("every submitted field is validated; other fields are rejected", async () => {
    const cases = {
      "nothing to update": {},
      "blank name": { name: "" },
      "non-string name": { name: 7 },
      "name over 100 chars": { name: "x".repeat(101) },
      "short password": { password: "short" },
      "null password": { password: null },
      "trying to change email": { email: "new@test.example.com" },
      "trying to change role": { role: "ADMIN" },
      "valid name plus a forbidden field": { name: "Ok", active: false },
    };
    for (const [label, body] of Object.entries(cases)) {
      expectValidationError(await call("/me", { method: "PATCH", body, token }), label);
    }
    const row = await prisma.user.findUnique({ where: { email: emailFor("profile") } });
    assert.equal(row.role, "MEMBER", "role unchanged");
    assert.equal(row.active, true, "active unchanged");
  });

  test("a user only ever sees and changes their own profile", async () => {
    const other = await register("other", { name: "Other User" });
    const response = await call("/me", { method: "PATCH", body: { name: "Changed" }, token });
    assert.equal(response.status, 200);
    const otherRow = await prisma.user.findUnique({ where: { id: other.body.user.id } });
    assert.equal(otherRow.name, "Other User", "the other user is untouched");

    const otherMe = await call("/me", { method: "GET", token: other.body.token });
    assert.equal(otherMe.body.user.email, emailFor("other"));
  });
});
