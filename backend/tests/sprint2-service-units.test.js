import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTaskFeatures, taskQuery } from "../src/sprint2/tasks.js";
import { createSecurityService } from "../src/sprint2/security.js";
import { createDashboard, csvCell } from "../src/sprint2/dashboard.js";
import {
  createCollaboration,
  mentionEmails,
} from "../src/sprint2/collaboration.js";
const projectId = randomUUID(),
  userId = randomUUID();
test("Task query service is repository-injectable without HTTP or PostgreSQL", async () => {
  let observed;
  const fake = {
    project: {
      findUnique: async () => ({ id: projectId, ownerId: userId, members: [] }),
    },
    task: {
      findMany: async (args) => {
        observed = args;
        return [{ id: "only-task" }];
      },
    },
  };
  const rows = await createTaskFeatures(fake).query(userId, projectId, {
    q: "Needle",
    priority: "HIGH",
    sort: "dueDate",
    direction: "asc",
  });
  assert.equal(rows[0].id, "only-task");
  assert.equal(observed.where.projectId, projectId);
  assert.equal(observed.where.OR[1].description.contains, "Needle");
  assert.deepEqual(observed.orderBy[0], {
    dueDate: { sort: "asc", nulls: "last" },
  });
});
test("Security listing repository mock requests only public fields", async () => {
  let spec;
  const fake = {
    user: {
      findMany: async (args) => {
        spec = args;
        return [];
      },
    },
  };
  assert.deepEqual(await createSecurityService(fake).listUsers(), []);
  assert.equal(spec.select.passwordHash, undefined);
  assert.equal(spec.select.sessionVersion, undefined);
  assert.equal(spec.select.active, true);
});
test("Personal Today repository query always scopes the assignee and project membership", async () => {
  let args;
  const fake = {
    task: {
      findMany: async (value) => {
        args = value;
        return [];
      },
    },
  };
  await createDashboard(fake).today(userId, new Date("2026-01-03T23:59Z"));
  assert.equal(args.where.assigneeId, userId);
  assert.equal(args.where.project.members.some.userId, userId);
  assert.equal(args.where.status.not, "DONE");
  assert.equal(
    args.where.OR[0].dueDate.lte.toISOString(),
    "2026-01-03T00:00:00.000Z",
  );
});
test("Comment validation rejects invalid input before opening any repository transaction", async () => {
  let transactions = 0;
  const fake = {
    $transaction: () => {
      transactions++;
      throw new Error("Must not reach storage");
    },
  };
  for (const body of ["", " ", "x".repeat(2001)])
    await assert.rejects(
      createCollaboration(fake).comment(userId, randomUUID(), { body }),
      (e) => e.status === 400,
    );
  assert.equal(transactions, 0);
});
test("Filter validation and CSV formula protection are pure service units", () => {
  for (const q of [
    { sort: "unsafe" },
    { direction: "bad" },
    { from: "2026-02-30" },
    { status: ["TODO"] },
  ])
    assert.throws(() => taskQuery(q));
  for (const v of ["=1+1", "+SUM(1)", "-1", "@cmd", "\t=1"])
    assert.ok(csvCell(v).startsWith("\"'"));
  assert.deepEqual(mentionEmails("Hi (@a@example.test). @a@example.test"), [
    "a@example.test",
  ]);
});
