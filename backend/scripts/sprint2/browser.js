import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import os from "node:os";
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
// The production frontend default API URL is localhost:5000. Do not run against
// an existing application: failure to bind aborts instead of touching it.
const server = app.listen(5000);
await new Promise((r, j) => {
  server.once("listening", r);
  server.once("error", j);
});
const f = await fixture(500, 20);
let browser;
try {
  await mkdir(
    resolve(
      process.env.BROWSER_SCREENSHOT || "performance-results/dashboard.png",
      "..",
    ),
    { recursive: true },
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const results = [];
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(
      ({ token }) => {
        localStorage.setItem("taskflow.token", token);
        localStorage.setItem("taskflow.theme", "light");
      },
      { token: f.tokens[0] },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400)
        errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    const start = performance.now();
    await page.goto(process.env.FRONTEND_URL + "/#/dashboard");
    await page.locator('[data-dashboard-ready="true"]').waitFor();
    await page.getByRole("img", { name: /Sprint burndown/ }).waitFor();
    await page.getByText("125 / 500", { exact: true }).waitFor();
    await page.getByText("25%", { exact: true }).waitFor();
    await page
      .locator(".feature-chart polyline")
      .first()
      .waitFor({ state: "visible" });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const elapsed = performance.now() - start;
    const result = {
      run: i + 1,
      milliseconds: Math.round(elapsed * 100) / 100,
      errors,
      passed: elapsed <= 2000 && errors.length === 0,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    if (i === 0)
      await page.screenshot({
        path: resolve(
          process.env.BROWSER_SCREENSHOT || "performance-results/dashboard.png",
        ),
        fullPage: true,
      });
    await context.close();
  }
  const report = {
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    node: process.version,
    platform: os.platform(),
    os: os.release(),
    cpu: os.cpus()[0]?.model,
    method:
      "Five fresh browser contexts (cold HTTP cache); production Vite preview; navigation through token restore, project fetch, metrics/workload and SVG burndown render, correct 125/500 and 25%, then two animation frames. No network/CPU throttling; local network. No concurrent background load.",
    dataset: { tasks: 500, members: 20 },
    results,
  };
  const output = resolve(
    process.env.BROWSER_REPORT || "performance-results/browser.json",
  );
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await f.cleanup();
  await db.$disconnect();
  await new Promise((r) => server.close(r));
}
