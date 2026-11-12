import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getProjectAccess,
  getTaskAccess,
  isUuid,
} from "../src/services/permissionService.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const OUTSIDER_ID = "55555555-5555-4555-8555-555555555555";

function projectDatabase(project) {
  return {
    project: {
      findUnique: async () => project,
    },
  };
}

test("UUID validation accepts UUID strings and rejects other input", () => {
  assert.equal(isUuid(PROJECT_ID), true);
  assert.equal(isUuid(PROJECT_ID.toUpperCase()), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(null), false);
});

test("project access rejects malformed IDs before querying", async () => {
  const db = {
    project: {
      findUnique: async () => {
        throw new Error("Malformed IDs must not reach storage");
      },
    },
  };

  assert.equal(await getProjectAccess(MEMBER_ID, "invalid", db), null);
});

test("project access returns null when the project is missing", async () => {
  assert.equal(await getProjectAccess(MEMBER_ID, PROJECT_ID, projectDatabase(null)), null);
});

test("project access distinguishes an outsider, a member, and the owner", async () => {
  const project = { id: PROJECT_ID, ownerId: OWNER_ID, name: "Project" };

  assert.deepEqual(
    await getProjectAccess(MEMBER_ID, PROJECT_ID, projectDatabase({ ...project, members: [] })),
    { project, isOwner: false, isMember: false },
  );
  assert.deepEqual(
    await getProjectAccess(
      MEMBER_ID,
      PROJECT_ID,
      projectDatabase({ ...project, members: [{ userId: MEMBER_ID }] }),
    ),
    { project, isOwner: false, isMember: true },
  );
  assert.deepEqual(
    await getProjectAccess(OWNER_ID, PROJECT_ID, projectDatabase({ ...project, members: [] })),
    { project, isOwner: true, isMember: true },
  );
});

test("task access rejects malformed and missing task IDs", async () => {
  const db = {
    task: {
      findUnique: async () => {
        throw new Error("Malformed IDs must not reach storage");
      },
    },
  };

  assert.equal(await getTaskAccess(MEMBER_ID, "invalid", db), null);
  db.task.findUnique = async () => null;
  assert.equal(await getTaskAccess(MEMBER_ID, TASK_ID, db), null);
});

test("task access grants status changes to project owners", async () => {
  const task = { id: TASK_ID, projectId: PROJECT_ID, assigneeId: MEMBER_ID };
  const db = projectDatabase({ id: PROJECT_ID, ownerId: OWNER_ID, members: [] });
  db.task = { findUnique: async () => task };

  assert.deepEqual(await getTaskAccess(OWNER_ID, TASK_ID, db), {
    project: { id: PROJECT_ID, ownerId: OWNER_ID },
    isOwner: true,
    isMember: true,
    task,
    isAssignee: false,
    canChangeStatus: true,
  });
});

test("only an assignee who remains a project member may change task status", async () => {
  const task = { id: TASK_ID, projectId: PROJECT_ID, assigneeId: MEMBER_ID };
  const db = projectDatabase({
    id: PROJECT_ID,
    ownerId: OWNER_ID,
    members: [{ userId: MEMBER_ID }],
  });
  db.task = { findUnique: async () => task };
  const memberAccess = await getTaskAccess(MEMBER_ID, TASK_ID, db);
  assert.equal(memberAccess.isAssignee, true);
  assert.equal(memberAccess.canChangeStatus, true);

  db.project.findUnique = async () => ({
    id: PROJECT_ID,
    ownerId: OWNER_ID,
    members: [],
  });
  const removedAssigneeAccess = await getTaskAccess(MEMBER_ID, TASK_ID, db);
  assert.equal(removedAssigneeAccess.isAssignee, true);
  assert.equal(removedAssigneeAccess.isMember, false);
  assert.equal(removedAssigneeAccess.canChangeStatus, false);

  const otherMemberAccess = await getTaskAccess(OUTSIDER_ID, TASK_ID, db);
  assert.equal(otherMemberAccess.isAssignee, false);
  assert.equal(otherMemberAccess.canChangeStatus, false);
});
