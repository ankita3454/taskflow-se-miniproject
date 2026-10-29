import { Prisma } from "@prisma/client";
import prisma from "../repositories/prisma.js";
import {
  asObject,
  assertValid,
  validateProjectName,
  ValidationError,
} from "../utils/validation.js";

export class ProjectError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isUniqueViolation(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const projectFields = {
  id: true,
  name: true,
  ownerId: true,
  archived: true,
};

export async function createProject(ownerId, body) {
  const fields = asObject(body);
  const unknown = Object.keys(fields).filter((key) => key !== "name");
  if (unknown.length > 0) {
    throw new ValidationError(`Only name can be provided (got: ${unknown.join(", ")})`);
  }
  assertValid({ name: validateProjectName(fields.name) });

  try {
    return await prisma.project.create({
      data: {
        name: fields.name.trim(),
        ownerId,
        members: {
          create: { userId: ownerId, projectRole: "Owner" },
        },
      },
      select: {
        ...projectFields,
        members: { select: { userId: true, projectRole: true } },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ProjectError(409, "PROJECT_NAME_IN_USE", "Project name already in use");
    }
    throw error;
  }
}

export async function getProjectsForMember(userId) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { name: "asc" },
    select: projectFields,
  });
}
