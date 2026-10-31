import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';

// Use a test-specific connection label so the lock barrier cannot accidentally
// count activity from other test suites. Extra connections are only for this
// regression test's blocker and monitor, not a production configuration change.
const runId = randomUUID();
const applicationName = `activity-concurrency-${runId}`;
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.set('connection_limit', '10');
databaseUrl.searchParams.set('application_name', applicationName);
process.env.DATABASE_URL = databaseUrl.toString();

const { default: prisma } = await import('../src/repositories/prisma.js');
const { updateTask } = await import('../src/services/taskService.js');
let owner;
let project;

before(async () => {
  owner = await prisma.user.create({
    data: {
      name: 'Activity concurrency owner',
      email: `activity-concurrency-${runId}@example.test`,
      passwordHash: 'x'.repeat(60),
    },
  });
  project = await prisma.project.create({
    data: {
      name: `Activity concurrency ${runId}`,
      ownerId: owner.id,
      members: { create: { userId: owner.id, projectRole: 'Owner' } },
    },
  });
});

after(async () => {
  try {
    if (project) {
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id }, select: { id: true },
      });
      await prisma.activityLog.deleteMany({
        where: { taskId: { in: tasks.map(task => task.id) } },
      });
      await prisma.task.deleteMany({ where: { projectId: project.id } });
      await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
    }
    if (owner) await prisma.user.delete({ where: { id: owner.id } });
  } finally {
    await prisma.$disconnect();
  }
});

async function makeTask() {
  return prisma.task.create({
    data: { projectId: project.id, title: 'Original', priority: 'MEDIUM' },
  });
}

async function concurrentEdits(taskId, firstTitle, secondTitle) {
  let signalLocked;
  let releaseLock;
  const locked = new Promise(resolve => { signalLocked = resolve; });
  const released = new Promise(resolve => { releaseLock = resolve; });
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`
      SELECT task_id FROM tasks WHERE task_id = ${taskId}::uuid FOR UPDATE
    `;
    signalLocked();
    await released;
  }, { timeout: 15000 });

  await Promise.race([
    locked,
    blocker.then(() => { throw new Error('Row blocker ended before acquiring lock'); }),
  ]);

  const edits = Promise.allSettled([
    updateTask({ taskId, userId: owner.id, body: { title: firstTitle } }),
    updateTask({ taskId, userId: owner.id, body: { title: secondTitle } }),
  ]);

  let blocked = 0;
  try {
    // With the old implementation both edits read Original and then block on
    // UPDATE. With the fix they block before reading, on SELECT FOR UPDATE.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows = await prisma.$queryRaw`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%tasks%'
        AND query ILIKE ${`%${taskId}%`}
    `;
      blocked = rows[0].count;
      if (blocked >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  } finally {
    releaseLock();
    await blocker;
  }

  const results = await edits;

  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
  return {
    task: await prisma.task.findUnique({ where: { id: taskId } }),
    logs: await prisma.activityLog.findMany({ where: { taskId, field: 'title' } }),
  };
}

test('concurrent edits log the actual overwritten title', { timeout: 20000 }, async () => {
  const original = await makeTask();
  const { task, logs } = await concurrentEdits(original.id, 'First edit', 'Second edit');
  assert.equal(logs.length, 2);
  // Lock acquisition order is intentionally unspecified. Validate the chain,
  // rather than assuming request order or transaction-start timestamps.
  const finalEntry = logs.find(log => log.newValue === task.title);
  assert.ok(finalEntry);
  const earlierEntry = logs.find(log => log.id !== finalEntry.id);
  assert.equal(earlierEntry.oldValue, 'Original');
  assert.equal(finalEntry.oldValue, earlierEntry.newValue);
  for (const log of logs) assert.equal(log.actorId, owner.id);
});

test('concurrent identical edits produce only one actual-change log', { timeout: 20000 }, async () => {
  const original = await makeTask();
  const { task, logs } = await concurrentEdits(original.id, 'Same title', 'Same title');
  assert.equal(task.title, 'Same title');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].oldValue, 'Original');
  assert.equal(logs[0].newValue, 'Same title');
});

test('a failed activity write rolls back the task edit', async () => {
  const task = await makeTask();
  await assert.rejects(
    updateTask({ taskId: task.id, userId: randomUUID(), body: { title: 'Must roll back' } }),
    error => error.code === 'P2003',
  );
  assert.equal((await prisma.task.findUnique({ where: { id: task.id } })).title, 'Original');
  assert.equal(await prisma.activityLog.count({ where: { taskId: task.id } }), 0);
});
