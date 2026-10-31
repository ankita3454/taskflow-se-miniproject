import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';
import app from '../src/app.js';
import prisma from '../src/repositories/prisma.js';
import { signToken } from '../src/utils/jwt.js';
jest.setTimeout(30000);
let users, tokens, project, server, base;
const run = randomUUID();
async function request(path, { as = 'owner', method = 'GET', body, key, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const auth = token ?? tokens[as];
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function createTask(extra = {}, key) {
  const result = await request('/tasks', { method: 'POST', key, body: { projectId: project.id, title: 'Workflow task', priority: 'MEDIUM', ...extra } });
  expect(result.status).toBe(201);
  return result.body.task;
}
async function notifications(taskId) { return prisma.notification.findMany({ where: { taskId } }); }
async function logs(taskId) { return prisma.activityLog.findMany({ where: { taskId } }); }
beforeAll(async () => {
  users = {};
  for (const name of ['owner', 'member', 'other', 'outsider']) users[name] = await prisma.user.create({ data: { name, email: `notif-flow-${name}-${run}@example.test`, passwordHash: 'x'.repeat(60) } });
  tokens = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, signToken(user)]));
  project = await prisma.project.create({ data: { name: `Notification flows ${run}`, ownerId: users.owner.id, members: { create: ['owner', 'member', 'other'].map(name => ({ userId: users[name].id })) } } });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
afterAll(async () => {
  try {
    if (project) {
      const tasks = await prisma.task.findMany({ where: { projectId: project.id }, select: { id: true } });
      const ids = tasks.map(t => t.id);
      await prisma.notification.deleteMany({ where: { taskId: { in: ids } } });
      await prisma.activityLog.deleteMany({ where: { taskId: { in: ids } } });
      await prisma.taskCreationRequest.deleteMany({ where: { taskId: { in: ids } } });
      await prisma.task.deleteMany({ where: { projectId: project.id } });
      await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
    }
    if (users) await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map(u => u.id) } } });
    if (server) await new Promise(resolve => server.close(resolve));
  } finally { await prisma.$disconnect(); }
});
test('creation with an assignee persists exactly one notification, including same-key retry', async () => {
  const key = randomUUID();
  const task = await createTask({ title: 'Initial assignment', assigneeId: users.member.id }, key);
  const retry = await createTask({ title: 'Initial assignment', assigneeId: users.member.id }, key);
  expect(retry.id).toBe(task.id);
  const saved = await notifications(task.id);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ userId: users.member.id, type: 'TASK_ASSIGNED', isRead: false });
});
test('concurrent same-key creation has one task and one assignment notification', async () => {
  const key = randomUUID();
  const tasks = await Promise.all(Array.from({ length: 4 }, () => createTask({ title: 'Concurrent assignment', assigneeId: users.member.id }, key)));
  expect(new Set(tasks.map(t => t.id)).size).toBe(1);
  expect(await notifications(tasks[0].id)).toHaveLength(1);
});
test('assignment and reassignment create recipient notifications and matching activity entries', async () => {
  const task = await createTask();
  for (const name of ['member', 'other']) {
    const result = await request(`/tasks/${task.id}/assignee`, { method: 'PATCH', body: { assigneeId: users[name].id } });
    expect(result.status).toBe(200);
  }
  const saved = await notifications(task.id);
  expect(saved).toHaveLength(2);
  expect(saved.map(n => n.userId).sort()).toEqual([users.member.id, users.other.id].sort());
  const activity = await logs(task.id);
  expect(activity).toHaveLength(2);
  expect(activity.every(l => l.field === 'assigneeId' && l.actorId === users.owner.id)).toBe(true);
});
test('assigning the same member again creates neither another notification nor another log', async () => {
  const task = await createTask({ assigneeId: users.member.id });
  const result = await request(`/tasks/${task.id}/assignee`, { method: 'PATCH', body: { assigneeId: users.member.id } });
  expect(result.status).toBe(200);
  expect(await notifications(task.id)).toHaveLength(1);
  expect(await logs(task.id)).toHaveLength(0);
});
test('rejected assignment does not change the task or create success notifications/logs', async () => {
  const task = await createTask();
  for (const args of [{ as: 'member', body: { assigneeId: users.other.id } }, { body: { assigneeId: users.outsider.id } }]) {
    const result = await request(`/tasks/${task.id}/assignee`, { method: 'PATCH', ...args });
    expect([400, 403]).toContain(result.status);
  }
  expect((await prisma.task.findUnique({ where: { id: task.id } })).assigneeId).toBeNull();
  expect(await notifications(task.id)).toHaveLength(0);
  expect(await logs(task.id)).toHaveLength(0);
});
test('assignee status change notifies the project Owner, not the actor', async () => {
  const task = await createTask({ assigneeId: users.member.id });
  const result = await request(`/tasks/${task.id}/status`, { as: 'member', method: 'PATCH', body: { status: 'IN_PROGRESS' } });
  expect(result.status).toBe(200);
  expect(await notifications(task.id)).toHaveLength(2);
  expect((await notifications(task.id)).find(n => n.type === 'TASK_STATUS_CHANGED')).toMatchObject({ userId: users.owner.id });
  expect((await logs(task.id))[0]).toMatchObject({ field: 'status', oldValue: 'TODO', newValue: 'IN_PROGRESS', actorId: users.member.id });
});
test('illegal and unauthorized status requests create no additional notifications or activity', async () => {
  const task = await createTask({ assigneeId: users.member.id });
  const jump = await request(`/tasks/${task.id}/status`, { as: 'member', method: 'PATCH', body: { status: 'DONE' } });
  const outsider = await request(`/tasks/${task.id}/status`, { as: 'other', method: 'PATCH', body: { status: 'IN_PROGRESS' } });
  expect(jump.status).toBe(400); expect(outsider.status).toBe(403);
  expect(await notifications(task.id)).toHaveLength(1);
  expect(await logs(task.id)).toHaveLength(0);
});
test('Owner can update a task with a removed assignee without leaking a new notification', async () => {
  const task = await createTask({ assigneeId: users.other.id });
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: users.other.id } } });
  try {
    const result = await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } });
    expect(result.status).toBe(200);
    expect(await notifications(task.id)).toHaveLength(1);
    expect(await logs(task.id)).toHaveLength(1);
  } finally { await prisma.projectMember.create({ data: { projectId: project.id, userId: users.other.id } }); }
});
test('an unassigned task status change has activity but no recipient notification', async () => {
  const task = await createTask();
  expect((await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } })).status).toBe(200);
  expect(await logs(task.id)).toHaveLength(1);
  expect(await notifications(task.id)).toHaveLength(0);
});
test('list/read/count endpoints show only the recipient and persist read state', async () => {
  const task = await createTask({ assigneeId: users.member.id });
  const notification = (await notifications(task.id))[0];
  expect((await request('/notifications', { as: 'member' })).body.notifications.some(n => n.id === notification.id)).toBe(true);
  expect((await request('/notifications', { as: 'outsider' })).body.notifications).toHaveLength(0);
  expect((await request(`/notifications/${notification.id}/read`, { as: 'outsider', method: 'PATCH' })).status).toBe(404);
  expect((await request(`/notifications/${notification.id}/read`, { as: 'member', method: 'PATCH' })).status).toBe(200);
  expect((await prisma.notification.findUnique({ where: { id: notification.id } })).isRead).toBe(true);
  expect((await request('/notifications', { as: 'member' })).body.notifications.find(n => n.id === notification.id).isRead).toBe(true);
  await request('/notifications/read-all', { as: 'member', method: 'PATCH' });
  expect((await request('/notifications/unread-count', { as: 'member' })).body.unreadCount).toBe(0);
});
test('missing, invalid and expired JWTs are rejected by notification APIs', async () => {
  const expired = jwt.sign({ sub: users.member.id }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of ['', 'invalid', expired]) expect((await request('/notifications', { token, as: 'none' })).status).toBe(401);
});
test('notification insertion failure rolls back status, activity and assignment changes', async () => {
  const task = await createTask();
  const constraint = `review_notification_${run.replaceAll('-', '')}`;
  // Test-only fault injection on this fixture; all identifiers/values are generated UUIDs.
  await prisma.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT "${constraint}" CHECK (task_id <> '${task.id}'::uuid)`);
  try {
    const assign = await request(`/tasks/${task.id}/assignee`, { method: 'PATCH', body: { assigneeId: users.member.id } });
    expect(assign.status).toBe(500);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).assigneeId).toBeNull();
    expect(await logs(task.id)).toHaveLength(0);
    await prisma.task.update({ where: { id: task.id }, data: { assigneeId: users.member.id } });
    const status = await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } });
    expect(status.status).toBe(500);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('TODO');
    expect(await logs(task.id)).toHaveLength(0);
  } finally { await prisma.$executeRawUnsafe(`ALTER TABLE notifications DROP CONSTRAINT "${constraint}"`); }
});
test('failed initial-assignment notification rolls back the task and idempotency claim', async () => {
  const key = randomUUID();
  const title = `fail-create-${run}`;
  const constraint = `review_creation_${run.replaceAll('-', '')}`;
  await prisma.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT "${constraint}" CHECK (body NOT LIKE '%${title}%')`);
  try {
    const result = await request('/tasks', { method: 'POST', key, body: { projectId: project.id, title, priority: 'MEDIUM', assigneeId: users.member.id } });
    expect(result.status).toBe(500);
    expect(await prisma.task.count({ where: { projectId: project.id, title } })).toBe(0);
    expect(await prisma.taskCreationRequest.count({ where: { userId: users.owner.id, key } })).toBe(0);
  } finally { await prisma.$executeRawUnsafe(`ALTER TABLE notifications DROP CONSTRAINT "${constraint}"`); }
});


test('Owner status change notifies the assignee, not the actor', async () => {
  const task = await createTask({ assigneeId: users.member.id });
  const before = await notifications(task.id);
  expect((await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } })).status).toBe(200);
  const saved = (await notifications(task.id)).filter(n => n.type === 'TASK_STATUS_CHANGED');
  expect(saved).toHaveLength(1);
  expect(saved[0].userId).toBe(users.member.id);
  expect(await notifications(task.id)).toHaveLength(before.length + 1);
});
test('initial self-assignment sends no notification and preserves task creation', async () => {
  const task = await createTask({ assigneeId: users.owner.id });
  expect(task.assigneeId).toBe(users.owner.id);
  expect(await notifications(task.id)).toHaveLength(0);
});
test('Owner self-assignment and status updates retain activity but no self-notifications', async () => {
  const task = await createTask();
  expect((await request(`/tasks/${task.id}/assignee`, { method: 'PATCH', body: { assigneeId: users.owner.id } })).status).toBe(200);
  expect((await request(`/tasks/${task.id}/status`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } })).status).toBe(200);
  expect(await notifications(task.id)).toHaveLength(0);
  expect((await logs(task.id)).map(log => log.field).sort()).toEqual(['assigneeId', 'status']);
});
