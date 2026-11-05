import prisma from "../repositories/prisma.js";
import { object, fail, dateOnly, projectAccess } from "./common.js";
export const utcToday = (now = new Date()) =>
  new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
export function metrics(tasks, members, now = new Date()) {
  const today = utcToday(now),
    done = tasks.filter((t) => t.status === "DONE").length;
  return {
    total: tasks.length,
    done,
    completion: tasks.length
      ? Math.round((done / tasks.length) * 10000) / 100
      : 0,
    overdue: tasks.filter(
      (t) => t.status !== "DONE" && t.dueDate && t.dueDate < today,
    ).length,
    workload: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      open: tasks.filter(
        (t) => t.assigneeId === m.userId && t.status !== "DONE",
      ).length,
    })),
  };
}
export function burndown(tasks, logs, start, end, now = new Date()) {
  if (!start || !end) return null;
  const scope = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate >= start &&
      t.dueDate <= end &&
      t.createdAt <= new Date(end.getTime() + 86399999),
  );
  const byTask = new Map();
  for (const log of logs) {
    if (!byTask.has(log.taskId)) byTask.set(log.taskId, []);
    byTask.get(log.taskId).push(log);
  }
  const days = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
    const date = new Date(time),
      cutoff = new Date(time + 86399999);
    let actual = 0;
    for (const t of scope) {
      if (t.createdAt > cutoff) continue;
      const changes = (byTask.get(t.id) || [])
        .filter((l) => l.createdAt <= cutoff)
        .sort((a, b) => a.createdAt - b.createdAt);
      const status = changes.length ? changes.at(-1).newValue : "TODO";
      if (status !== "DONE") actual++;
    }
    days.push({
      date: date.toISOString().slice(0, 10),
      plannedRemaining: scope.filter((t) => t.dueDate > date).length,
      actualRemaining: date > utcToday(now) ? null : actual,
    });
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    current: utcToday(now) >= start && utcToday(now) <= end,
    scopeCount: scope.length,
    days,
  };
}
export function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function taskCsv(tasks) {
  return (
    [
      ["Title", "Assignee", "Status", "Priority", "Due date"],
      ...tasks.map((t) => [
        t.title,
        t.assignee?.name || "",
        t.status,
        t.priority,
        t.dueDate?.toISOString().slice(0, 10) || "",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
export function createDashboard(db = prisma) {
  return {
    async today(userId, now = new Date()) {
      return db.task.findMany({
        where: {
          assigneeId: userId,
          status: { not: "DONE" },
          project: { members: { some: { userId } } },
          OR: [{ dueDate: { lte: utcToday(now) } }, { status: "IN_REVIEW" }],
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      });
    },
    async project(userId, projectId, now = new Date()) {
      const project = await projectAccess(userId, projectId, db);
      const [tasks, members, logs] = await Promise.all([
        db.task.findMany({ where: { projectId } }),
        db.projectMember.findMany({
          where: { projectId },
          include: { user: { select: { name: true } } },
        }),
        db.activityLog.findMany({
          where: { task: { projectId }, field: "status" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      ]);
      return {
        project: {
          id: project.id,
          name: project.name,
          ownerId: project.ownerId,
        },
        ...metrics(tasks, members, now),
        burndown: burndown(
          tasks,
          logs,
          project.sprintStart,
          project.sprintEnd,
          now,
        ),
      };
    },
    async configure(userId, projectId, input) {
      object(input, ["start", "end"]);
      const start = dateOnly(input.start),
        end = dateOnly(input.end);
      if (end < start || (end - start) / 86400000 > 89)
        fail(
          400,
          "VALIDATION_ERROR",
          "Sprint must contain 1–90 inclusive days",
        );
      await projectAccess(userId, projectId, db, true);
      return db.project.update({
        where: { id: projectId },
        data: { sprintStart: start, sprintEnd: end },
        select: { id: true, sprintStart: true, sprintEnd: true },
      });
    },
    async csv(userId, projectId) {
      await projectAccess(userId, projectId, db, true);
      return taskCsv(
        await db.task.findMany({
          where: { projectId },
          include: { assignee: { select: { name: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      );
    },
  };
}
