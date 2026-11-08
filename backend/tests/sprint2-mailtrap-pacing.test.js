import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSendPacer, createReminderService } from '../src/sprint2/reminders.js';

test('pacer serializes concurrent attempts at least 10.5 seconds apart', async () => {
  let clock = 0;
  const sleeps = [], starts = [];
  const pace = createSendPacer({ intervalMs: 10500, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; } });
  await Promise.all([0, 1, 2].map(() => pace(async () => { starts.push(clock); clock += 10; })));
  assert.deepEqual(starts, [0, 10510, 21020]);
  assert.deepEqual(sleeps, [10500, 10500]);
});

test('pacer continues after a failed attempt without retrying it', async () => {
  let clock = 0, calls = 0;
  const pace = createSendPacer({ intervalMs: 10500, now: () => clock, sleep: async (ms) => { clock += ms; } });
  const first = pace(async () => { calls++; throw new Error('ambiguous'); });
  const second = pace(async () => { calls++; return clock; });
  const [a, b] = await Promise.allSettled([first, second]);
  assert.equal(a.status, 'rejected');
  assert.equal(b.value, 10500);
  assert.equal(calls, 2);
});

test('reminder service waits for a send slot outside the database transaction', async () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const task = { id: 'task', projectId: 'project', assigneeId: 'member', status: 'TODO', dueDate: new Date('2026-01-04T00:00:00.000Z'), title: 'Task', assignee: { active: true, email: 'member@example.test' } };
  let active = 0, slots = 0, sends = 0;
  const tx = {
    $queryRaw: async () => [],
    task: { findUnique: async () => task },
    projectMember: { findUnique: async () => ({ userId: 'member' }) },
    reminder: { create: async () => ({ id: 'reminder' }), update: async () => ({}) },
    notification: { create: async () => ({}) },
  };
  const db = { task: { findMany: async () => [task] }, $transaction: async (fn) => { active++; try { return await fn(tx); } finally { active--; } } };
  const send = async () => { sends++; };
  send.runWithPacing = async (operation) => { assert.equal(active, 0, 'pacing must happen without an open transaction'); slots++; return operation(); };
  const result = await createReminderService(db, send)(now);
  assert.equal(slots, 1);
  assert.equal(sends, 1);
  assert.equal(result.sent, 1);
});
