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
