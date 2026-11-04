import prisma from "../repositories/prisma.js";
import notificationService from "../services/notification.service.js";
import {
  fail,
  object,
  uuid,
  projectAccess,
  taskAccess,
  lockProject,
} from "./common.js";
import { recordAudit } from "./security.js";
export function mentionEmails(text) {
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(?:^|[\s(])@([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,})(?=$|[\s,;:!?.)])/g,
        ),
      ].map((m) => m[1].toLowerCase()),
    ),
  ];
}
export function createCollaboration(db = prisma) {
  return {
    async manage(userId, projectId, targetId, input) {
      // Validate before the raw UUID cast in lockProject().
      uuid(projectId);
      uuid(targetId);
      object(input, ["projectRole"]);
      if (!["Owner", "Member"].includes(input.projectRole))
        fail(400, "VALIDATION_ERROR", "Project role must be Owner or Member");
      return db.$transaction(async (tx) => {
        await lockProject(tx, projectId);
        const project = await projectAccess(userId, projectId, tx, true);
        const member = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: targetId } },
          include: { user: true },
        });
        if (!member || !member.user.active)
          fail(404, "NOT_FOUND", "Active project member not found");
        if (targetId === project.ownerId && input.projectRole !== "Owner")
          fail(
            409,
            "OWNER_REQUIRED",
            "Transfer ownership before demoting the sole Owner",
          );
        if (input.projectRole === "Owner" && targetId !== project.ownerId) {
          await tx.project.update({
            where: { id: projectId },
            data: { ownerId: targetId },
          });
          await tx.projectMember.update({
            where: { projectId_userId: { projectId, userId: project.ownerId } },
            data: { projectRole: "Member" },
          });
        }
        await tx.projectMember.update({
          where: { projectId_userId: { projectId, userId: targetId } },
          data: { projectRole: input.projectRole },
        });
        await recordAudit("PROJECT_ROLE_CHANGED", userId, targetId, tx);
      });
    },
    async remove(userId, projectId, targetId) {
      // Validate before the raw UUID cast in lockProject().
      uuid(projectId);
      uuid(targetId);
      return db.$transaction(async (tx) => {
        await lockProject(tx, projectId);
        const p = await projectAccess(userId, projectId, tx, true);
        if (p.ownerId === targetId)
          fail(409, "OWNER_REQUIRED", "Cannot remove the project Owner");
        const result = await tx.projectMember.deleteMany({
          where: { projectId, userId: targetId },
        });
        if (result.count)
          await recordAudit("PROJECT_MEMBER_REMOVED", userId, targetId, tx);
      });
    },
    async archive(userId, projectId) {
      // Validate before the raw UUID cast in lockProject().
      uuid(projectId);
      return db.$transaction(async (tx) => {
        await lockProject(tx, projectId);
        await projectAccess(userId, projectId, tx, true);
        await tx.project.update({
          where: { id: projectId },
          data: { archived: true },
        });
        await recordAudit("PROJECT_ARCHIVED", userId, projectId, tx);
      });
    },
    async comment(userId, taskId, input) {
      object(input, ["body"]);
      if (
        typeof input.body !== "string" ||
        !input.body.trim() ||
        input.body.length > 2000
      )
        fail(
          400,
          "VALIDATION_ERROR",
          "Comment must contain 1–2,000 characters",
        );
      return db.$transaction(async (tx) => {
        const initial = await taskAccess(userId, taskId, tx);
        await lockProject(tx, initial.task.projectId);
        const { task } = await taskAccess(userId, taskId, tx);
        const comment = await tx.comment.create({
          data: { taskId, authorId: userId, body: input.body },
        });
        await tx.activityLog.create({
          data: {
            taskId,
            actorId: userId,
            field: "comment",
            newValue: { commentId: comment.id },
          },
        });
        const emails = mentionEmails(input.body);
        if (emails.length) {
          const members = await tx.projectMember.findMany({
            where: {
              projectId: task.projectId,
              user: { active: true, email: { in: emails } },
            },
            select: { userId: true },
          });
          await notificationService.notifyTaskMentioned(
            taskId,
            members.map((m) => m.userId).filter((id) => id !== userId),
            tx,
          );
        }
        return comment;
      });
    },
    async history(userId, taskId) {
      await taskAccess(userId, taskId, db);
      const [comments, activities] = await Promise.all([
        db.comment.findMany({
          where: { taskId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        db.activityLog.findMany({
          where: { taskId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      ]);
      const ids = [
        ...new Set([
          ...comments.map((c) => c.authorId),
          ...activities.map((c) => c.actorId),
        ]),
      ];
      const users = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return {
        comments: comments.map((c) => ({
          ...c,
          authorName: names.get(c.authorId) || "Former user",
        })),
        activities: activities.map((c) => ({
          ...c,
          actorName: names.get(c.actorId) || "Former user",
        })),
      };
    },
  };
}
