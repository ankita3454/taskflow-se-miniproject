# Sprint 2 final follow-up

Baseline: merged main `85aa4a1b3ae826b5b504e26f3f837b2871bb5079` (PR #57). This follow-up is intended as one pull request. Related issues: #22, #24, #28, #29, #30, #31 and #32. Merging this PR alone does not prove every acceptance criterion.

## Changes
- Dashboard startup defers mounting the task workspace until the first visit. Once mounted, it stays mounted across navigation to preserve unfinished task forms. Existing polling resumes when it mounts.
- Task listing uses Prisma's PostgreSQL relation join strategy to reduce separate relation queries. The Prisma client must be regenerated (the backend Docker build already runs `prisma generate`). There is no database migration for the generator setting.
- Login limiting separates normalized email accounts sharing a proxy IP, counts failed and in-flight attempts, releases successful reservations, and also limits malformed JSON. Forwarded-IP headers remain untrusted. Limitations are documented in OPEN-RISKS.md.
- Auth and Project services and task listing accept an optional injected database for isolated unit tests. The existing task write paths are not fully refactored.

## Verification performed in the isolated Linux environment
- Backend: 132 core tests plus 77 notification tests passed, using isolated PostgreSQL 16.
- Frontend: 66 tests, ESLint and production build passed.
- Five 500-task production-preview dashboard runs: 419.78, 286.67, 301.75, 272.00 and 294.23 ms, with no recorded browser errors. See `evidence/browser-followup-linux.json`.
- 1,000-task load test: 20-user list p95 381.50 ms, search 79.15 ms, filter 234.18 ms; no errors. See `evidence/load-followup-linux.json` for methodology and all measurements. These measurements are not Windows results.
- The six scripted authenticated browser smoke checks passed; this does not test the registration/login screens end to end. See `evidence/smoke-followup-linux.json`.
- Production `npm audit --omit=dev` still reports three high-severity entries in the Prisma / @prisma/config / deepmerge-ts dependency chain. The reported fix requires a Prisma major upgrade. No untested forced upgrade was made.

## Remaining acceptance evidence
- #22: verify actual 3-day and 1-day Mailtrap sandbox delivery, duplicate prevention and Done suppression using disposable data; keep credentials local. See CHAITHANYA.md.
- #24 / #30: rerun the 500-task browser performance check on the target Windows setup; the earlier Windows run had two results above 2 seconds. Preserve those historical results.
- #29 / #31: rerun the 20-user load check on the target Windows setup; the earlier list p95 was 2319.49 ms. Review the result independently where required.
- #28: review and remediate or formally accept the remaining dependency advisory and validate the deployment-specific rate-limit behavior.
- #32: complete outstanding isolation/review and second-runtime portability checks. A Linux Node/PostgreSQL run is not a second Docker-runtime check.

Use a fresh disposable test database for any destructive fixture or migration test. Verify its connection in the same shell immediately before running tests; never point test scripts at the application database. Never commit `.env`, local Docker port overrides, credentials or private test data. Do not mark the issues complete until their actual criteria are satisfied and evidence reviewed.
