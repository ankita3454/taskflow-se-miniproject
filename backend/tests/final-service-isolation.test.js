import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUserById } from '../src/services/authService.js';
import { createProject, getProjectsForMember } from '../src/services/projectService.js';
import { listProjectTasks } from '../src/services/taskService.js';

test('injected auth lookup returns only public fields', async () => {
  const db = { user: { findUnique: async ({ where }) => ({ id: where.id, name: 'Test', email: 'test@example.com', role: 'MEMBER', active: true, passwordHash: 'private' }) } };
  const result = await getUserById('user-1', db);
  assert.equal(result.id, 'user-1');
  assert.equal('passwordHash' in result, false);
});

test('injected project repository creates the owner membership and scopes listings', async () => {
  let createArgs, listArgs;
  const db = { project: { create: async (args) => { createArgs = args; return { id: 'p1' }; }, findMany: async (args) => { listArgs = args; return []; } } };
  await createProject('owner-1', { name: '  Project  ' }, db);
  assert.equal(createArgs.data.name, 'Project');
  assert.equal(createArgs.data.ownerId, 'owner-1');
  assert.deepEqual(createArgs.data.members.create, { userId: 'owner-1', projectRole: 'Owner' });
  await getProjectsForMember('member-1', db);
  assert.equal(listArgs.where.members.some.userId, 'member-1');
});

test('injected task list retains project scope, ordering, and joined relations', async () => {
  let query;
  const db = { task: { findMany: async (args) => { query = args; return []; } } };
  await listProjectTasks('project-1', db);
  assert.equal(query.where.projectId, 'project-1');
  assert.deepEqual(query.orderBy, { createdAt: 'desc' });
  assert.equal(query.relationLoadStrategy, 'join');
  assert.ok(query.include);
});

test('injected transactional task creation retains same-key retry behavior', async () => {
  const { createTask } = await import('../src/services/taskService.js');
  const projectId = '00000000-0000-4000-8000-000000000001';
  const ownerId = '00000000-0000-4000-8000-000000000002';
  let request, task, creates = 0;
  const tx = {
    $queryRaw: async () => [],
    project: { findUnique: async () => ({ id: projectId, ownerId, archived: false }) },
    projectMember: { findUnique: async () => ({ userId: ownerId }) },
    task: { create: async ({ data }) => { creates++; return task = { id: 'new-task', ...data }; } },
    taskCreationRequest: {
      create: async ({ data }) => { request = { id: 'request', ...data }; return request; },
      update: async () => { request.task = task; },
    },
  };
  const db = {
    taskCreationRequest: { findUnique: async () => request || null },
    $transaction: async (fn) => fn(tx),
  };
  const input = { body: { projectId, title: 'Example', priority: 'LOW' }, userId: ownerId, projectAccess: { project: { id: projectId, ownerId, archived: false }, isOwner: true }, idempotencyKey: 'same-key' };
  const first = await createTask(input, db);
  const second = await createTask(input, db);
  assert.equal(first.id, second.id);
  assert.equal(creates, 1);
  await assert.rejects(() => createTask({ ...input, body: { ...input.body, title: 'Different' } }, db), (e) => e.code === 'IDEMPOTENCY_KEY_CONFLICT');
});

test('injected task status transaction reports missing tasks without a real database', async () => {
  const { changeTaskStatus } = await import('../src/services/taskService.js');
  const db = { $transaction: async (fn) => fn({ task: { findUnique: async () => null } }) };
  await assert.rejects(() => changeTaskStatus({ taskId: 'missing', status: 'IN_PROGRESS', userId: 'user' }, db), (e) => e.code === 'NOT_FOUND');
});
