import { spawnSync } from "node:child_process";

const suites = [
  [
    "--test",
    "tests/part3-auth-project-unit.test.js",
    "tests/task-service-units.test.js",
    "tests/invitation-service-units.test.js",
    "tests/permission-service-units.test.js",
    "tests/sprint2-mailtrap-pacing.test.js",
    "tests/server-startup.test.js",
  ],
  [
    "--experimental-vm-modules",
    "node_modules/jest/bin/jest.js",
    "--runInBand",
    "--runTestsByPath",
    "tests/notification.service.test.js",
    "tests/notification-read.service.test.js",
  ],
];

for (const args of suites) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
