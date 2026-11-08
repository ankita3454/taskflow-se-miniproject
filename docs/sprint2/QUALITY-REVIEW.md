# #32 quality review and evidence

- Maintainability: existing Auth/Project/Task/Notification services retained; new
  task/security/collaboration/dashboard/reminder service factories accept injectable
  repositories/transport. Routes contain HTTP adaptation, not business policy.
- Testability: sprint2-service-units.test.js and notification service tests exercise repository mocks without HTTP/PostgreSQL. Auth, Project and Task entrypoints accept injected database clients; final-service-isolation.test.js checks isolated reads, transaction entry and same-key retry. Existing database/API tests remain in place.
- Reliability: original 17 TaskWorkspace tests and creation-idempotency API tests
  remain; no assertions removed. Repeated/parallel reminder calls produce one claim
  and one send attempt per interval. Uncertain SMTP failures deliberately do not retry.
- Usability: final browser smoke script (package 08) records project creation and
  first task through Projects then Tasks (two primary authenticated work screens;
  three including registration). Uses a disposable authenticated test account.
- Performance: actual 1,000-task and 20-user results are in package 06, 500-task
  production browser results follow in 08. These are local baselines, not load SLAs.
- Portability: existing Dockerfile/build settings retained, no host address/credentials
  baked into images. Original user setup runs on Windows Docker Desktop, but NEW Sprint
  2 has NOT been built/run there or on a second Docker-compatible runtime here.
  A clean second-runtime check is a required remaining acceptance item.

## Required portability evidence, coordinator and Nuthan

Use a clean clone plus merged packages on a second Docker-compatible environment.
Configure local .env from examples, choose an allowed host database port if needed,
run `docker compose up -d --build`, record `docker compose ps`, backend health,
registration/login, project/task, comments, dashboard, and notification workflows.
Record runtime/OS/version/commit and failures/retest. Never publish .env, credentials,
JWTs, Mailtrap secrets or DB backups. Do not use down -v against a database you need.

#32 is partially verified, not automatically closed. See OPEN-RISKS.md.
