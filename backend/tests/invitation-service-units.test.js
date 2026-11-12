import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  createInvitation,
  getReceivedInvitations,
  respondToInvitation,
} from "../src/services/invitationService.js";

const userId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const invite = {
  id: invitationId,
  projectId,
  invitedEmail: "member@example.test",
  status: "PENDING",
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "test",
  });
}

test("invitation creation validates input before querying and rejects existing members", async () => {
  let queries = 0;
  const db = {
    projectMember: {
      findFirst: async () => {
        queries++;
        return { userId };
      },
    },
    projectInvitation: { create: async () => assert.fail("must not create") },
  };

  for (const body of [null, [], { email: "" }, { email: "not-an-email" }, { email: "member@example.test", extra: true }]) {
    await assert.rejects(createInvitation(projectId, userId, body, db));
  }
  assert.equal(queries, 0);

  await assert.rejects(
    createInvitation(projectId, userId, { email: "MEMBER@example.test" }, db),
    (error) => error.code === "ALREADY_PROJECT_MEMBER" && error.status === 409,
  );
  assert.equal(queries, 1);
});

test("invitation creation normalizes email and exposes the selected result", async () => {
  let args;
  const db = {
    projectMember: { findFirst: async () => null },
    projectInvitation: {
      create: async (value) => {
        args = value;
        return invite;
      },
    },
  };

  assert.equal(
    await createInvitation(projectId, userId, { email: " Member@Example.Test " }, db),
    invite,
  );
  assert.equal(args.data.invitedEmail, "member@example.test");
  assert.equal(args.data.projectId, projectId);
  assert.equal(args.data.invitedById, userId);
  assert.equal(args.select.project.select.id, true);
});

test("invitation creation maps unique conflicts and propagates other storage failures", async () => {
  const db = {
    projectMember: { findFirst: async () => null },
    projectInvitation: { create: async () => { throw uniqueViolation(); } },
  };
  await assert.rejects(
    createInvitation(projectId, userId, { email: "member@example.test" }, db),
    (error) => error.code === "INVITATION_ALREADY_PENDING" && error.status === 409,
  );

  const failure = new Error("storage unavailable");
  db.projectInvitation.create = async () => { throw failure; };
  await assert.rejects(
    createInvitation(projectId, userId, { email: "member@example.test" }, db),
    (error) => error === failure,
  );
});

test("received invitations normalize the user's email and return newest pending invitations", async () => {
  let query;
  const rows = [invite];
  const db = {
    user: { findUnique: async () => ({ email: " MEMBER@EXAMPLE.TEST " }) },
    projectInvitation: {
      findMany: async (args) => {
        query = args;
        return rows;
      },
    },
  };

  assert.equal(await getReceivedInvitations(userId, db), rows);
  assert.deepEqual(query.where, { invitedEmail: "member@example.test", status: "PENDING" });
  assert.deepEqual(query.orderBy, { createdAt: "desc" });

  db.user.findUnique = async () => null;
  await assert.rejects(
    getReceivedInvitations(userId, db),
    (error) => error.code === "NOT_FOUND" && error.status === 404,
  );
});

function respondDb({ user, invitation, changed = 1 } = {}) {
  const calls = { upserts: 0, updates: 0 };
  const tx = {
    user: { findUnique: async () => user === undefined ? { email: "member@example.test" } : user },
    projectInvitation: {
      findUnique: async () => invitation === undefined ? { ...invite } : invitation,
      updateMany: async () => {
        calls.updates++;
        return { count: changed };
      },
    },
    projectMember: {
      upsert: async () => { calls.upserts++; },
    },
  };
  const db = {
    $transaction: async (callback) => {
      const result = await callback(tx);
      return result;
    },
    ...tx,
  };
  return { db, calls, tx };
}

test("responding to an invitation rejects invalid, missing, foreign, and completed invitations", async () => {
  const { db } = respondDb();
  await assert.rejects(
    respondToInvitation("bad-id", userId, "ACCEPTED", db),
    (error) => error.code === "NOT_FOUND",
  );

  for (const values of [
    { user: null },
    { invitation: null },
  ]) {
    const state = respondDb(values);
    await assert.rejects(
      respondToInvitation(invitationId, userId, "ACCEPTED", state.db),
      (error) => error.code === "NOT_FOUND",
    );
  }

  const foreign = respondDb({ user: { email: "other@example.test" } });
  await assert.rejects(
    respondToInvitation(invitationId, userId, "ACCEPTED", foreign.db),
    (error) => error.code === "FORBIDDEN" && error.status === 403,
  );

  const completed = respondDb({ invitation: { ...invite, status: "DECLINED" } });
  await assert.rejects(
    respondToInvitation(invitationId, userId, "ACCEPTED", completed.db),
    (error) => error.code === "INVITATION_ALREADY_RESPONDED" && error.status === 409,
  );
});

test("accepting updates a pending invitation and grants membership; decline does not", async () => {
  const accepted = respondDb();
  let acceptedReads = 0;
  accepted.tx.projectInvitation.findUnique = async () => ({
    ...invite,
    status: acceptedReads++ === 0 ? "PENDING" : "ACCEPTED",
  });
  const acceptedResult = await respondToInvitation(invitationId, userId, "ACCEPTED", accepted.db);
  assert.equal(acceptedResult.status, "ACCEPTED");
  assert.equal(accepted.calls.upserts, 1);
  assert.equal(accepted.calls.updates, 1);

  const declined = respondDb();
  let declinedReads = 0;
  declined.tx.projectInvitation.findUnique = async () => ({
    ...invite,
    status: declinedReads++ === 0 ? "PENDING" : "DECLINED",
  });
  const declinedResult = await respondToInvitation(invitationId, userId, "DECLINED", declined.db);
  assert.equal(declinedResult.status, "DECLINED");
  assert.equal(declined.calls.upserts, 0);
  assert.equal(declined.calls.updates, 1);
});

test("responding detects a concurrent response and does not add membership", async () => {
  const state = respondDb({ changed: 0 });
  await assert.rejects(
    respondToInvitation(invitationId, userId, "ACCEPTED", state.db),
    (error) => error.code === "INVITATION_ALREADY_RESPONDED",
  );
  assert.equal(state.calls.upserts, 0);
});
