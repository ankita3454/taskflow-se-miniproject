import "dotenv/config";
import autocannon from "autocannon";
import os from "node:os";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.ALLOW_PERFORMANCE_FIXTURES !== "yes")
  throw new Error(
    "Use a disposable database and set ALLOW_PERFORMANCE_FIXTURES=yes.",
  );
process.env.JWT_SECRET ??= "disposable-performance-only";
const { default: app } = await import("../../src/app.js");
const { default: db } = await import("../../src/repositories/prisma.js");
const { fixture } = await import("./fixtures.js");
const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const f = await fixture();
const results = [];
const duration = Number(process.env.LOAD_DURATION_SECONDS || 5);
try {
  for (const users of [1, 20])
    for (const [operation, path] of [
      ["list", `/projects/${f.project.id}/tasks`],
      ["search", `/projects/${f.project.id}/task-query?q=needle`],
      [
        "filter",
        `/projects/${f.project.id}/task-query?status=TODO&priority=LOW&sort=dueDate&direction=asc`,
      ],
    ]) {
      // One connection per distinct authenticated user, no pipelining. Requests run
      // closed-loop without think time; each operation is measured separately.
      let index = 0;
      const samples = [];
      const clients = new Set();
      const result = await new Promise((ok, no) => {
        const run = autocannon(
          {
            url: `http://127.0.0.1:${server.address().port}/api/v1${path}`,
            connections: users,
            pipelining: 1,
            duration,
            setupClient(client) {
              const n = index++;
              clients.add(n);
              client.setHeaders({
                authorization: `Bearer ${f.tokens[n % users]}`,
              });
            },
          },
          (e, r) => (e ? no(e) : ok(r)),
        );
        run.on("response", (_client, _status, _bytes, time) =>
          samples.push(time),
        );
      });
      samples.sort((a, b) => a - b);
      const p95 =
        samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] ?? null;
      const row = {
        operation,
        concurrentUsers: users,
        distinctTokens: clients.size,
        durationSeconds: duration,
        requests: result.requests.total,
        errors: result.errors,
        timeouts: result.timeouts,
        non2xx: result.non2xx,
        p95Milliseconds: p95,
        p99Milliseconds: result.latency.p99,
        passed:
          p95 !== null &&
          p95 <= 1000 &&
          result.errors === 0 &&
          result.timeouts === 0 &&
          result.non2xx === 0,
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
  const report = {
    recordedAt: new Date().toISOString(),
    environment: {
      os: os.release(),
      platform: os.platform(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      node: process.version,
    },
    method:
      "Autocannon, same-process Express listener plus real PostgreSQL; closed-loop; separate operations; response-event latencies sorted with nearest-rank p95; no warmup exclusion.",
    dataset: { tasks: 1000, users: 20, projectCount: 1 },
    results,
  };
  const output = resolve(
    process.env.LOAD_REPORT || "performance-results/load.json",
  );
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  if (results.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  await f.cleanup();
  await db.$disconnect();
  await new Promise((r) => server.close(r));
}
