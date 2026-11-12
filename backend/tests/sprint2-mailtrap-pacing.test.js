import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSendPacer,
  createReminderService,
  mailtrapSender,
  startReminderScheduler,
} from '../src/sprint2/reminders.js';

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

const now = new Date('2026-01-01T00:00:00.000Z');
const reminderTask = {
  id: 'task',
  projectId: 'project',
  assigneeId: 'member',
  status: 'TODO',
  dueDate: new Date('2026-01-04T00:00:00.000Z'),
  title: 'Task',
  assignee: { active: true, email: 'member@example.test' },
};

function reminderDb({ candidate = reminderTask, current = reminderTask, member = { userId: 'member' }, claimError, sendTask = reminderTask } = {}) {
  const updates = [];
  let transactions = 0;
  const tx = {
    $queryRaw: async () => [],
    task: {
      findUnique: async () => transactions === 1 ? current : sendTask,
    },
    projectMember: { findUnique: async () => transactions === 1 ? member : { userId: 'member' } },
    reminder: {
      create: async () => {
        if (claimError) throw claimError;
        return { id: 'reminder' };
      },
      update: async () => ({}),
      updateMany: async (args) => { updates.push(args); return {}; },
    },
    notification: { create: async () => ({}) },
  };
  const db = {
    task: { findMany: async () => candidate ? [candidate] : [] },
    reminder: { updateMany: async (args) => { updates.push(args); return {}; } },
    $transaction: async (callback) => {
      transactions++;
      return callback(tx);
    },
  };
  return { db, tx, updates, get transactions() { return transactions; } };
}

test('reminder run returns zero counts when there are no due candidates', async () => {
  const db = { task: { findMany: async () => [] } };
  assert.deepEqual(await createReminderService(db, async () => {})(now), {
    sent: 0,
    skipped: 0,
    uncertain: 0,
  });
});

test('reminder claims skip stale, completed, inactive, wrong-date, and non-member tasks', async () => {
  const cases = [
    { candidate: reminderTask, current: null },
    { candidate: reminderTask, current: { ...reminderTask, status: 'DONE' } },
    { candidate: reminderTask, current: { ...reminderTask, dueDate: new Date('2026-01-03T00:00:00.000Z') } },
    { candidate: reminderTask, current: { ...reminderTask, assignee: { active: false } } },
    { candidate: reminderTask, current: reminderTask, member: null },
  ];
  for (const options of cases) {
    const state = reminderDb(options);
    const result = await createReminderService(state.db, async () => {})(now);
    assert.equal(result.skipped, 1);
    assert.equal(result.sent, 0);
    assert.equal(state.transactions, 1);
  }
});

test('reminder claims treat unique conflicts as skipped and propagate other DB errors', async () => {
  const duplicate = reminderDb({ claimError: { code: 'P2002' } });
  assert.deepEqual(
    await createReminderService(duplicate.db, async () => {})(now),
    { sent: 0, skipped: 1, uncertain: 0 },
  );
  const failure = new Error('database unavailable');
  const broken = reminderDb({ claimError: failure });
  await assert.rejects(createReminderService(broken.db, async () => {})(now), (error) => error === failure);
});

test('reminder send rechecks changed tasks and marks claims cancelled without sending', async () => {
  const changed = { ...reminderTask, status: 'DONE' };
  const state = reminderDb({ candidate: reminderTask, current: reminderTask, sendTask: changed });
  let sends = 0;
  const result = await createReminderService(state.db, async () => { sends++; })(now);
  assert.deepEqual(result, { sent: 0, skipped: 1, uncertain: 0 });
  assert.equal(sends, 0);
  assert.equal(state.updates[0].data.state, 'CANCELLED');
});

test('reminder send records unknown state when mail delivery fails', async () => {
  const state = reminderDb();
  const failure = new Error('SMTP outcome unknown');
  const result = await createReminderService(state.db, async () => { throw failure; })(now);
  assert.deepEqual(result, { sent: 0, skipped: 0, uncertain: 1 });
  assert.equal(state.updates[0].data.state, 'UNKNOWN');
});

test('Mailtrap configuration rejects unsafe settings and accepts supported sandbox ports', () => {
  assert.throws(() => mailtrapSender({}), /Configure Mailtrap/);
  assert.throws(() => mailtrapSender({
    MAILTRAP_HOST: 'smtp.example.test',
    MAILTRAP_PORT: '2525',
    MAILTRAP_USER: 'user',
    MAILTRAP_PASSWORD: 'password',
  }), /Configure Mailtrap/);
  for (const port of ['2525', '587', '465']) {
    const send = mailtrapSender({
      MAILTRAP_PORT: port,
      MAILTRAP_USER: 'user',
      MAILTRAP_PASSWORD: 'password',
    });
    assert.equal(typeof send, 'function');
    assert.equal(typeof send.runWithPacing, 'function');
  }
});

test('disabled reminder scheduler returns a safe stop function', () => {
  const previous = process.env.REMINDERS_ENABLED;
  delete process.env.REMINDERS_ENABLED;
  try {
    assert.equal(typeof startReminderScheduler(), 'function');
  } finally {
    if (previous === undefined) delete process.env.REMINDERS_ENABLED;
    else process.env.REMINDERS_ENABLED = previous;
  }
});
