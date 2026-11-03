import prisma from "../repositories/prisma.js";
import {
  fail,
  object,
  uuid,
  dateOnly,
  projectAccess,
  taskAccess,
  lockProject,
} from "./common.js";
import { recordAudit } from "./security.js";
const statuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"],
  priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export function taskQuery(query) {
  object(query, [
    "q",
    "status",
    "priority",
    "assignee",
    "tag",
    "from",
    "to",
    "sort",
    "direction",
  ]);
  const where = {};
  for (const [key, values] of [
    ["status", statuses],
    ["priority", priorities],
  ])
    if (query[key]) {
      if (!values.includes(query[key]))
        fail(400, "VALIDATION_ERROR", `Invalid ${key}`);
      where[key] = query[key];
    }
  if (query.q) {
    if (typeof query.q !== "string" || query.q.length > 200)
      fail(400, "VALIDATION_ERROR", "Search must be at most 200 characters");
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.assignee) {
    where.assigneeId =
      query.assignee === "unassigned" ? null : uuid(query.assignee);
  }
  if (query.tag) where.taskTags = { some: { tagId: uuid(query.tag) } };
  if (query.from || query.to) {
    const from = query.from ? dateOnly(query.from) : null,
      to = query.to ? dateOnly(query.to) : null;
    if (from && to && from > to)
      fail(400, "VALIDATION_ERROR", "Date range is reversed");
    where.dueDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  const sort = query.sort || "createdAt",
    direction = query.direction || "desc";
  if (
    !["createdAt", "dueDate", "priority"].includes(sort) ||
    !["asc", "desc"].includes(direction)
  )
    fail(400, "VALIDATION_ERROR", "Invalid sort");
  return {
    where,
    orderBy: [
      {
        [sort]:
          sort === "dueDate" ? { sort: direction, nulls: "last" } : direction,
      },
      { id: "asc" },
    ],
  };
}
export function createTaskFeatures(db = prisma) {
  return {
    async query(userId, projectId, query) {
      await projectAccess(userId, projectId, db);
      const spec = taskQuery(query);
      return db.task.findMany({
        where: { ...spec.where, projectId },
        orderBy: spec.orderBy,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          taskTags: { include: { tag: true } },
          blockers: {
            include: {
              blocker: { select: { id: true, title: true, status: true } },
            },
          },
        },
      });
    },
    async tags(userId, projectId) {
      await projectAccess(userId, projectId, db);
      return db.tag.findMany({
        where: { projectId },
        orderBy: { normalizedName: "asc" },
      });
    },
    async createTag(userId, projectId, body) {
      object(body, ["name"]);
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 80
      )
        fail(400, "VALIDATION_ERROR", "Tag name must be 1–80 characters");
      await projectAccess(userId, projectId, db);
      const name = body.name.trim();
      return db.tag.upsert({
        where: {
          projectId_normalizedName: {
            projectId,
            normalizedName: name.toLowerCase(),
          },
        },
        create: { projectId, name, normalizedName: name.toLowerCase() },
        update: {},
      });
    },
    async applyTag(userId, taskId, tagId, remove = false) {
      uuid(tagId);
      return db.$transaction(async (tx) => {
        const { task } = await taskAccess(userId, taskId, tx);
        const tag = await tx.tag.findUnique({ where: { id: tagId } });
        if (!tag || tag.projectId !== task.projectId)
          fail(404, "NOT_FOUND", "Project tag not found");
        if (remove) await tx.taskTag.deleteMany({ where: { taskId, tagId } });
        else
          await tx.taskTag.upsert({
            where: { taskId_tagId: { taskId, tagId } },
            create: { taskId, tagId },
            update: {},
          });
      });
    },
    async dependency(userId, taskId, body) {
      object(body, ["blockerId"]);
      uuid(body.blockerId);
      return db.$transaction(async (tx) => {
        const initial = await taskAccess(userId, taskId, tx);
        await lockProject(tx, initial.task.projectId);
        const { task } = await taskAccess(userId, taskId, tx);
        const blocker = await tx.task.findUnique({
          where: { id: body.blockerId },
        });
        if (!blocker || blocker.projectId !== task.projectId)
          fail(404, "NOT_FOUND", "Blocker must belong to the same project");
        if (taskId === blocker.id)
          fail(409, "DEPENDENCY_CYCLE", "A task cannot block itself");
        if (task.status === "DONE" && blocker.status !== "DONE")
          fail(
            409,
            "TASK_COMPLETED",
            "Cannot add an incomplete blocker to a completed task",
          );
        const edges = await tx.taskDependency.findMany({
          where: { task: { projectId: task.projectId } },
        });
        const stack = [blocker.id],
          seen = new Set();
        while (stack.length) {
          const id = stack.pop();
          if (id === taskId)
            fail(409, "DEPENDENCY_CYCLE", "Dependency would create a cycle");
          if (seen.has(id)) continue;
          seen.add(id);
          for (const edge of edges)
            if (edge.taskId === id) stack.push(edge.blockerId);
        }
        return tx.taskDependency.upsert({
          where: { taskId_blockerId: { taskId, blockerId: blocker.id } },
          create: { taskId, blockerId: blocker.id },
          update: {},
        });
      });
    },
    async delete(userId, taskId) {
      return db.$transaction(async (tx) => {
        const initial = await taskAccess(userId, taskId, tx, true);
        await lockProject(tx, initial.task.projectId);
        await taskAccess(userId, taskId, tx, true);
        await recordAudit("TASK_DELETED", userId, taskId, tx);
        await tx.task.delete({ where: { id: taskId } });
      });
    },
  };
}
