import "dotenv/config";
import db from "../src/repositories/prisma.js";
// Operator-only first-Admin bootstrap, not an HTTP endpoint. Requires database
// access, an existing registered account, explicit opt-in and zero active Admins.
try {
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== "yes")
    throw new Error(
      "Set ALLOW_ADMIN_BOOTSTRAP=yes only when intentionally bootstrapping the first Admin.",
    );
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@"))
    throw new Error(
      "Provide the existing registered account email as the only argument.",
    );
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(740226)`;
    if (await tx.user.count({ where: { role: "ADMIN", active: true } }))
      throw new Error(
        "An active Admin already exists. Use the protected Administration screen instead.",
      );
    const user = await tx.user.findUnique({ where: { email } });
    if (!user?.active)
      throw new Error("An active registered account is required.");
    await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await tx.auditLog.create({
      data: { actorId: null, targetId: user.id, event: "ROLE_CHANGED" },
    });
  });
  console.log(
    "First Admin granted. Log in again. No project ownership was changed.",
  );
} finally {
  await db.$disconnect();
}
