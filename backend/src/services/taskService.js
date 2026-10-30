
import prisma from "../repositories/prisma.js";
import { createHash } from "node:crypto";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const ALLOWED_STATUS_TRANSITIONS = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_REVIEW"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: [],
};

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
};

function isValidUUID(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function hashTaskInput(input) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

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
    if (!isValidUUID(body.assigneeId)) {
      invalid("Assignee ID is invalid", {
        assigneeId: "Assignee ID must be a valid UUID",
      });
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

function validateIdempotencyKey(key) {
  if (key === undefined || key === null) return null;

  if (
    typeof key !== "string" ||
    key.trim().length === 0 ||
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    invalid(`Idempotency-Key must contain 1-${MAX_IDEMPOTENCY_KEY_LENGTH} characters`, {
      idempotencyKey: `Provide a non-empty key of at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    });
  }

  return key;
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function idempotencyConflict() {
  return new TaskError(
    409,
    "IDEMPOTENCY_KEY_CONFLICT",
    "This Idempotency-Key has already been used with a different request payload",
  );
}

async function findExistingIdempotentTask(userId, key, payloadHash) {
  const existing = await prisma.taskCreationRequest.findUnique({
    where: {
      userId_key: { userId, key },
    },
    include: {
      task: { include: TASK_INCLUDE },
    },
  });

  if (!existing) return null;

  if (existing.payloadHash !== payloadHash) {
    throw idempotencyConflict();
  }

  // A committed request should have its task. A missing task can occur if
  // related data was deleted after the original request.
  if (!existing.task) {
    throw new TaskError(
      409,
      "IDEMPOTENCY_RESULT_UNAVAILABLE",
      "The original task for this Idempotency-Key is no longer available",
    );
  }

  return existing.task;
}

async function createTaskNormally(input) {
  return prisma.task.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate,
      timeEstimate: input.timeEstimate,
      assigneeId: input.assigneeId,
      // Status intentionally omitted: Prisma applies the TODO default.
    },
    include: TASK_INCLUDE,
  });
}

async function createTaskIdempotently({ input, userId, key }) {
  const payloadHash = hashTaskInput(input);

  const existingTask = await findExistingIdempotentTask(
    userId,
    key,
    payloadHash,
  );

  if (existingTask) return existingTask;

  try {
    return await prisma.$transaction(async (tx) => {
      // The unique (userId, key) constraint arbitrates concurrent retries.
      const request = await tx.taskCreationRequest.create({
        data: {
          userId,
          key,
          payloadHash,
        },
      });

      const task = await tx.task.create({
        data: {
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          timeEstimate: input.timeEstimate,
          assigneeId: input.assigneeId,
        },
        include: TASK_INCLUDE,
      });

      await tx.taskCreationRequest.update({
        where: { id: request.id },
        data: { taskId: task.id },
      });

      return task;
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // Another request may have won the race. Its transaction must commit
    // before its task becomes visible, so retry the lookup briefly.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const task = await findExistingIdempotentTask(
        userId,
        key,
        payloadHash,
      );

      if (task) return task;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new TaskError(
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "A request with this Idempotency-Key is being processed; retry shortly",
    );
  }
}

export async function createTask({
  body,
  userId,
  projectAccess,
  idempotencyKey,
}) {
  const input = validateCreateInput(body);
  const key = validateIdempotencyKey(idempotencyKey);

  // Permission middleware has already established membership in this project.
  if (input.projectId !== projectAccess.project.id) {
    throw new TaskError(
      400,
      "PROJECT_ID_MISMATCH",
      "Project ID does not match the authorized project",
    );
  }

  if (projectAccess.project.archived) {
    throw new TaskError(
      409,
      "PROJECT_ARCHIVED",
      "Tasks cannot be created in an archived project",
    );
  }

  if (input.assigneeId) {
    if (!projectAccess.isOwner) {
      throw new TaskError(
        403,
        "FORBIDDEN",
        "Only the project Owner can assign tasks",
      );
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

    const isProjectOwner = projectAccess.project.ownerId === input.assigneeId;

    if (!membership && !isProjectOwner) {
      invalid("Assignee must belong to the project", {
        assigneeId: "Assignee must be a member of this project",
      });
    }
  }

  if (!key) {
    return createTaskNormally(input);
  }

  return createTaskIdempotently({ input, userId, key });
}

export async function listProjectTasks(projectId) {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: TASK_INCLUDE,
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

const VALID_TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

export async function changeTaskStatus({ taskId, status }) {
  if (
    typeof status !== "string" ||
    !VALID_TASK_STATUSES.includes(status)
  ) {
    throw new TaskError(
      400,
      "VALIDATION_ERROR",
      "Status must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE",
      {
        status: "Provide a valid task status",
      },
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    throw new TaskError(404, "NOT_FOUND", "Task not found");
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[task.status] ?? [];

  const isUnassignedReturn =
    task.status === "IN_PROGRESS" &&
    status === "TODO" &&
    task.assigneeId === null;

  if (!allowed.includes(status) && !isUnassignedReturn) {
    throw new TaskError(
      400,
      "INVALID_STATUS_TRANSITION",
      `Cannot change status from ${task.status} to ${status}`,
      {
        status: `Transition from ${task.status} to ${status} is not allowed`,
      },
    );
  }

  // Conditional update prevents a transition based on stale status.
  const result = await prisma.task.updateMany({
    where: {
      id: taskId,
      status: task.status,
      ...(isUnassignedReturn ? { assigneeId: null } : {}),
    },
    data: { status },
  });

  if (result.count !== 1) {
    throw new TaskError(
      409,
      "STATUS_CHANGED_CONCURRENTLY",
      "The task changed while this request was being processed. Refresh and try again.",
    );
  }

  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}

const EDITABLE_TASK_FIELDS = [
  "title",
  "description",
  "priority",
  "dueDate",
  "timeEstimate",
];

/**
 * Update task details.
 * The route must authenticate the user and enforce Project Owner access.
 * A completed task cannot be edited.
 */
export async function updateTask({ taskId, body }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    invalid("Request body must be a JSON object");
  }

  const keys = Object.keys(body);

  if (keys.length === 0) {
    invalid("At least one field must be provided");
  }

  const unknown = keys.filter((key) => !EDITABLE_TASK_FIELDS.includes(key));

  if (unknown.length > 0) {
    invalid("Request contains unsupported fields", {
      unknown: `Unsupported field(s): ${unknown.join(", ")}`,
    });
  }

  const data = {};

  if (Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      invalid("Title is required", { title: "Title is required" });
    }

    data.title = body.title.trim();

    if (data.title.length > MAX_TITLE_LENGTH) {
      invalid(`Title must be at most ${MAX_TITLE_LENGTH} characters`, {
        title: `Title must be at most ${MAX_TITLE_LENGTH} characters`,
      });
    }
  }

  if (Object.hasOwn(body, "description")) {
    if (body.description !== null && typeof body.description !== "string") {
      invalid("Description must be text", {
        description: "Description must be text or null",
      });
    }

    data.description = body.description === null
      ? null
      : body.description.trim();

    if (data.description?.length > MAX_DESCRIPTION_LENGTH) {
      invalid(
        `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
        {
          description: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
        },
      );
    }
  }

  if (Object.hasOwn(body, "priority")) {
    if (!PRIORITIES.includes(body.priority)) {
      invalid("A valid priority is required", {
        priority: `Priority must be one of: ${PRIORITIES.join(", ")}`,
      });
    }

    data.priority = body.priority;
  }

  if (Object.hasOwn(body, "dueDate")) {
    const value = body.dueDate;

    if (value === null || value === "") {
      data.dueDate = null;
    } else {
      if (!isValidDateOnly(value)) {
        invalid("Due date must be a valid date in YYYY-MM-DD format", {
          dueDate: "Use a valid date in YYYY-MM-DD format, or null to clear it",
        });
      }

      data.dueDate = new Date(`${value}T00:00:00.000Z`);
    }
  }

  if (Object.hasOwn(body, "timeEstimate")) {
    const value = body.timeEstimate;

    if (value === null || value === "") {
      data.timeEstimate = null;
    } else {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        invalid("Time estimate must be a non-negative number", {
          timeEstimate: "Enter a non-negative number, or null to clear it",
        });
      }

      data.timeEstimate = value;
    }
  }

  // Check completion before updating.
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new TaskError(404, "NOT_FOUND", "Task not found");
  }

  if (existing.status === "DONE") {
    throw new TaskError(
      409,
      "TASK_COMPLETED",
      "Completed tasks cannot be edited",
    );
  }

  // The status condition also protects against a task becoming DONE
  // between the check above and the database update.
  const result = await prisma.task.updateMany({
    where: {
      id: taskId,
      status: { not: "DONE" },
    },
    data,
  });

  if (result.count === 0) {
    const current = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });

    if (!current) {
      throw new TaskError(404, "NOT_FOUND", "Task not found");
    }

    throw new TaskError(
      409,
      "TASK_COMPLETED",
      "Completed tasks cannot be edited",
    );
  }

  return prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });
}
