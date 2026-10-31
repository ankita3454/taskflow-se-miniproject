import { Prisma } from "@prisma/client";
import prisma from "../repositories/prisma.js";
import { isUuid } from "./permissionService.js";
import {
  asObject,
  assertValid,
  normaliseEmail,
  validateEmail,
  ValidationError,
} from "../utils/validation.js";

export class InvitationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isUniqueViolation(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const invitationSelect = {
  id: true,
  invitedEmail: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  project: { select: { id: true, name: true } },
  invitedBy: { select: { id: true, name: true, email: true } },
};

export async function createInvitation(projectId, inviterId, body) {
  const fields = asObject(body);
  const unknown = Object.keys(fields).filter((key) => key !== "email");
  if (unknown.length > 0) {
    throw new ValidationError(`Only email can be provided (got: ${unknown.join(", ")})`);
  }
  assertValid({ email: validateEmail(fields.email) });
  const invitedEmail = normaliseEmail(fields.email);

  const existingMember = await prisma.projectMember.findFirst({
    where: { projectId, user: { email: invitedEmail } },
    select: { userId: true },
  });
  if (existingMember) {
    throw new InvitationError(409, "ALREADY_PROJECT_MEMBER", "This user is already a project member");
  }

  try {
    return await prisma.projectInvitation.create({
      data: { projectId, invitedById: inviterId, invitedEmail },
      select: invitationSelect,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new InvitationError(409, "INVITATION_ALREADY_PENDING", "An invitation is already pending");
    }
    throw error;
  }
}

export async function getReceivedInvitations(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    throw new InvitationError(404, "NOT_FOUND", "User not found");
  }

  return prisma.projectInvitation.findMany({
    where: { invitedEmail: normaliseEmail(user.email), status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: invitationSelect,
  });
}

export async function respondToInvitation(invitationId, userId, response) {
  if (!isUuid(invitationId)) {
    throw new InvitationError(404, "NOT_FOUND", "Invitation not found");
  }

  return prisma.$transaction(async (tx) => {
    const [user, invitation] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
      tx.projectInvitation.findUnique({
        where: { id: invitationId },
        select: { id: true, projectId: true, invitedEmail: true, status: true },
      }),
    ]);

    if (!user || !invitation) {
      throw new InvitationError(404, "NOT_FOUND", "Invitation not found");
    }
    if (normaliseEmail(user.email) !== normaliseEmail(invitation.invitedEmail)) {
      throw new InvitationError(403, "FORBIDDEN", "This invitation belongs to another user");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationError(409, "INVITATION_ALREADY_RESPONDED", "This invitation has already been responded to");
    }

    const changed = await tx.projectInvitation.updateMany({
      where: { id: invitationId, invitedEmail: normaliseEmail(user.email), status: "PENDING" },
      data: { status: response, respondedAt: new Date() },
    });
    if (changed.count !== 1) {
      throw new InvitationError(409, "INVITATION_ALREADY_RESPONDED", "This invitation has already been responded to");
    }

    if (response === "ACCEPTED") {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        create: {
          projectId: invitation.projectId,
          userId,
          projectRole: "Member",
        },
        update: {},
      });
    }

    return tx.projectInvitation.findUnique({
      where: { id: invitationId },
      select: invitationSelect,
    });
  });
}
