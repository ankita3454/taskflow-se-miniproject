import prisma from "../repositories/prisma.js";
import { isUuid } from "./permissionService.js";
import notificationService from "./notification.service.js";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export class TaskError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function invalid(message, fields = {}) {
  throw new TaskError(400, "VALIDATION_ERROR", message, fields);
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function validateCreateInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Request body must be a JSON object");
  }

  const allowed = [
    "projectId",
    "title",
    "description",
    "priority",
    "dueDate",
    "timeEstimate",
    "assigneeId",
  ];

  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    invalid("Request contains unsupported fields", {
      unknown: `Unsupported field(s): ${unknown.join(", ")}`,
    });
  }

  if (typeof body.projectId !== "string" || !body.projectId.trim()) {
    invalid("Project ID is required", { projectId: "Project ID is required" });
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    invalid("Title is required", { title: "Title is required" });
  }

  const title = body.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    invalid(`Title must be at most ${MAX_TITLE_LENGTH} characters`, {
      title: `Title must be at most ${MAX_TITLE_LENGTH} characters`,
    });
  }

  let description;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      invalid("Description must be text", {
        description: "Description must be text",
      });
    }
    description = body.description.trim();
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      invalid(`Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`, {
        description: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }

  if (!PRIORITIES.includes(body.priority)) {
    invalid("A valid priority is required", {
      priority: `Priority must be one of: ${PRIORITIES.join(", ")}`,
    });
  }

  let dueDate;
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== "") {
    if (!isValidDateOnly(body.dueDate)) {
      invalid("Due date must be a valid date in YYYY-MM-DD format", {
        dueDate: "Use a valid date in YYYY-MM-DD format",
      });
    }
    dueDate = new Date(`${body.dueDate}T00:00:00.000Z`);
  }

  let timeEstimate;
  if (body.timeEstimate !== undefined && body.timeEstimate !== null && body.timeEstimate !== "") {
    if (
      typeof body.timeEstimate !== "number" ||
      !Number.isFinite(body.timeEstimate) ||
      body.timeEstimate < 0
    ) {
      invalid("Time estimate must be a non-negative number", {
        timeEstimate: "Enter a non-negative number",
      });
    }
    timeEstimate = body.timeEstimate;
  }

  let assigneeId;
  if (body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== "") {
    if (typeof body.assigneeId !== "string") {
      invalid("Assignee ID is invalid", { assigneeId: "Assignee ID must be a string" });
    }
    assigneeId = body.assigneeId;
  }

  return {
    projectId: body.projectId,
    title,
    description: description || null,
    priority: body.priority,
    dueDate: dueDate ?? null,
    timeEstimate: timeEstimate ?? null,
    assigneeId: assigneeId ?? null,
  };
}

export async function createTask({ body, userId, projectAccess }) {
  const input = validateCreateInput(body);

  // The permission middleware has already established membership in this project.
  if (input.projectId !== projectAccess.project.id) {
    throw new TaskError(400, "PROJECT_ID_MISMATCH", "Project ID does not match the authorized project");
  }

  if (projectAccess.project.archived) {
    throw new TaskError(409, "PROJECT_ARCHIVED", "Tasks cannot be created in an archived project");
  }

  if (input.assigneeId) {
    if (!projectAccess.isOwner) {
      throw new TaskError(403, "FORBIDDEN", "Only the project Owner can assign tasks");
    }

    const assignee = await prisma.user.findUnique({
      where: { id: input.assigneeId },
      select: { id: true, active: true },
    });

    if (!assignee || !assignee.active) {
      invalid("Assignee must be an active user", {
        assigneeId: "Assignee does not exist or is inactive",
      });
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: input.projectId,
          userId: input.assigneeId,
        },
      },
      select: { userId: true },
    });

    // The project owner is allowed to assign themselves even if their membership
    // row is absent; ownership is determined by Project.ownerId.
    const isProjectOwner = projectAccess.project.ownerId === input.assigneeId;
    if (!membership && !isProjectOwner) {
      invalid("Assignee must belong to the project", {
        assigneeId: "Assignee must be a member of this project",
      });
    }
  }

  return prisma.task.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate,
      timeEstimate: input.timeEstimate,
      assigneeId: input.assigneeId,
      // status intentionally omitted: Prisma applies the TODO default.
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listProjectTasks(projectId) {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listProjectMembers(projectId) {
  return prisma.projectMember.findMany({
    where: { projectId, user: { active: true } },
    orderBy: { user: { name: "asc" } },
    select: {
      projectRole: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function assignTask({ taskId, body }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Request body must be a JSON object");
  }

  const unknown = Object.keys(body).filter((key) => key !== "assigneeId");
  if (unknown.length) {
    invalid("Request contains unsupported fields", {
      unknown: `Unsupported field(s): ${unknown.join(", ")}`,
    });
  }

  const assigneeId = body.assigneeId;
  if (!isUuid(assigneeId)) {
    invalid("A valid assignee ID is required", {
      assigneeId: "Assignee ID must be a valid UUID",
    });
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
      },
    });
    if (!task) {
      throw new TaskError(404, "NOT_FOUND", "Task not found");
    }

    const assignee = await tx.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, active: true },
    });
    const membership = await tx.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: task.projectId,
          userId: assigneeId,
        },
      },
      select: { userId: true },
    });

    if (!assignee || !assignee.active || !membership) {
      invalid("Assignee must be an active member of this project", {
        assigneeId: "Assignee must be an active member of this project",
      });
    }

    if (task.assigneeId === assigneeId) {
      return tx.task.findUnique({
        where: { id: taskId },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });
    }

    const updated = await tx.task.update({
      where: { id: taskId },
      data: { assigneeId },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    await notificationService.notifyTaskAssigned(taskId, tx);
    return updated;
  });
}

export async function listAccessibleProjects(userId) {
  return prisma.project.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      archived: true,
      ownerId: true,
    },
    orderBy: { name: "asc" },
  });
}
