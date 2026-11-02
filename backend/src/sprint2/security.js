import prisma from "../repositories/prisma.js";
import { fail, object, uuid, dateOnly } from "./common.js";
export const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
};
export const auditEvents = [
  "LOGIN_FAILED",
  "ROLE_CHANGED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  "TASK_DELETED",
  "PROJECT_ARCHIVED",
  "PROJECT_ROLE_CHANGED",
  "PROJECT_MEMBER_REMOVED",
];
export async function recordAudit(
  event,
  actorId = null,
  targetId = null,
  db = prisma,
) {
  return db.auditLog.create({ data: { event, actorId, targetId } });
}
export function createSecurityService(db = prisma) {
  return {
    listUsers: () =>
      db.user.findMany({
        select: publicFields,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    async updateUser(actorId, id, input) {
      uuid(id);
      const body = object(input, ["role", "active"]);
      if (
        !Object.keys(body).length ||
        ("role" in body && !["MEMBER", "OWNER", "ADMIN"].includes(body.role)) ||
        ("active" in body && typeof body.active !== "boolean")
      )
        fail(400, "VALIDATION_ERROR", "Provide a valid role or active boolean");
      if (
        id === actorId &&
        (body.active === false || (body.role && body.role !== "ADMIN"))
      )
        fail(
          409,
          "SELF_LOCKOUT",
          "Cannot remove your own administrator access",
        );
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${id}::uuid FOR UPDATE`;
        const old = await tx.user.findUnique({ where: { id } });
        if (!old) fail(404, "NOT_FOUND", "User not found");
        const data = {};
        if ("role" in body && body.role !== old.role) {
          data.role = body.role;
          await recordAudit("ROLE_CHANGED", actorId, id, tx);
        }
        if ("active" in body && body.active !== old.active) {
          data.active = body.active;
          if (!body.active) data.sessionVersion = { increment: 1 };
          await recordAudit(
            body.active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
            actorId,
            id,
            tx,
          );
        }
        return tx.user.update({ where: { id }, data, select: publicFields });
      });
    },
    async audit(query) {
      object(query, ["event", "from", "to"]);
      const where = {};
      if (query.event) {
        if (!auditEvents.includes(query.event))
          fail(400, "VALIDATION_ERROR", "Unknown audit event");
        where.event = query.event;
      }
      if (query.from || query.to) {
        const from = query.from ? dateOnly(query.from) : null,
          to = query.to ? dateOnly(query.to) : null;
        if (from && to && from > to)
          fail(400, "VALIDATION_ERROR", "Date range is reversed");
        where.createdAt = {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}),
        };
      }
      return db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1000,
      });
    },
  };
}
export function createLoginLimiter({
  limit = Number(process.env.LOGIN_RATE_LIMIT || 10),
  windowMs = Number(process.env.LOGIN_RATE_WINDOW_MS || 900000),
  now = Date.now,
  maxKeys = 10000,
} = {}) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isFinite(windowMs) ||
    windowMs < 1
  )
    throw new Error("Invalid login limiter configuration");
  const buckets = new Map();
  return async function loginLimiter(req, res, next) {
    const time = now(),
      key = req.ip;
    for (const [ip, b] of buckets) if (time >= b.until) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      // Saturation fails closed; it must not evict live limits and permit a bypass.
      if (buckets.size >= maxKeys)
        return res
          .status(429)
          .set("Retry-After", String(Math.ceil(windowMs / 1000)))
          .json({
            error: { code: "RATE_LIMITED", message: "Please try again later" },
          });
      bucket = { count: 0, until: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      try {
        await recordAudit("LOGIN_FAILED");
      } catch (e) {
        return next(e);
      }
      return res
        .status(429)
        .set(
          "Retry-After",
          String(Math.max(1, Math.ceil((bucket.until - time) / 1000))),
        )
        .json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts. Please try again later.",
          },
        });
    }
    next();
  };
}
