import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.ALLOW_PERFORMANCE_FIXTURES !== "yes")
  throw new Error(
    "Use a disposable database and set ALLOW_PERFORMANCE_FIXTURES=yes.",
  );
process.env.JWT_SECRET ??= "disposable-performance-only";
process.env.FRONTEND_URL =
  process.env.BROWSER_FRONTEND_URL || "http://localhost:5177";
const { chromium } =
  await import("../../../frontend/node_modules/playwright/index.mjs");
const { default: app } = await import("../../src/app.js");
const { default: db } = await import("../../src/repositories/prisma.js");
const { fixture } = await import("./fixtures.js");
const { signToken } = await import("../../src/utils/jwt.js");
const server = app.listen(5000);
await new Promise((r, j) => {
  server.once("listening", r);
  server.once("error", j);
});
const f = await fixture(4, 2);
let browser;
const results = [];
let createdProject;
try {
  const admin = await db.user.update({
    where: { id: f.users[0].id },
    data: { role: "ADMIN" },
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    (token) => localStorage.setItem("taskflow.token", token),
    signToken(admin),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.FRONTEND_URL + "/#/projects");
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Sprint2 browser walkthrough");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .locator(".project-summary strong")
    .filter({ hasText: "Sprint2 browser walkthrough" })
    .waitFor();
  createdProject = await db.project.findFirst({
    where: { ownerId: admin.id, name: "Sprint2 browser walkthrough" },
  });
  if (!createdProject) throw new Error("Project was not persisted");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption(createdProject.id);
  await page.getByLabel(/Title \(required/).fill("First browser-created task");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByText("First browser-created task", { exact: true }).waitFor();
  if ((await db.task.count({ where: { projectId: createdProject.id } })) !== 1)
    throw new Error("Expected exactly one persisted task");
  results.push({
    check: "New-user project and first task",
    passed: true,
    primaryScreens: 2,
    screens: ["Projects", "Tasks"],
    note: "Authenticated disposable test account; registration/login not counted as work screens. Three including registration.",
  });
  await page.getByRole("link", { name: "Task browser", exact: true }).click();
  await page.getByLabel("Browse project").selectOption(createdProject.id);
  await page
    .getByRole("button", {
      name: "Details: First browser-created task",
      exact: true,
    })
    .click();
  await page
    .getByLabel("New comment")
    .fill("Literal text <script>not executable</script>");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await page
    .getByText("Literal text <script>not executable</script>", { exact: true })
    .waitFor();
  results.push({
    check: "Task details and immutable comment history",
    passed: true,
  });
  await page.getByRole("button", { name: "Kanban view", exact: true }).click();
  await page.getByRole("heading", { name: "TODO", exact: true }).waitFor();
  for (const [nav, heading] of [
    ["Project settings", "Project membership and archiving"],
    ["Today", "Your Today view"],
    ["Administration", "User management"],
  ]) {
    await page.getByRole("link", { name: nav, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    results.push({ check: nav + " screen", passed: true });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  results.push({ check: "No browser JavaScript errors", passed: true });
  await context.close();
  console.log(JSON.stringify(results, null, 2));
  const out = resolve(
    process.env.SMOKE_REPORT || "performance-results/smoke.json",
  );
  await mkdir(resolve(out, ".."), { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        browser: browser.version(),
        results,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e.message);
  throw e;
} finally {
  if (browser) await browser.close();
  createdProject ||= await db.project.findFirst({
    where: { ownerId: f.users[0].id, name: "Sprint2 browser walkthrough" },
  });
  if (createdProject) {
    await db.task.deleteMany({ where: { projectId: createdProject.id } });
    await db.projectMember.deleteMany({
      where: { projectId: createdProject.id },
    });
    await db.project.delete({ where: { id: createdProject.id } });
  }
  await f.cleanup();
  await db.$disconnect();
  await new Promise((r) => server.close(r));
}
