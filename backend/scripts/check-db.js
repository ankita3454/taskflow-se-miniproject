import "dotenv/config";
import prisma from "../src/repositories/prisma.js";

try {
  const [users, projects, memberships, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.projectMember.count(),
    prisma.task.count(),
  ]);

  console.log("Database connection successful.");
  console.table({ users, projects, memberships, tasks });
} catch (error) {
  console.error("Database check failed.");
  console.error("Error code:", error.code || "UNKNOWN");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}