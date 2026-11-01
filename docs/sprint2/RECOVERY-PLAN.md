# Sprint 2: three-day recovery, not a rewritten sprint deadline

Prepared against main `92fb5d23b877e8d5f94401a5776d83372cd442b5`.
The original deadline was missed. Keep it in the project record. Use actual dates
and PR timestamps for recovery. These packages were prepared with AI assistance;
named owners below are the integration/review owners, not a claim of sole authorship.

## Strict merge queue

| Order | Package / integration owner | Issues / work |
|---|---|---|
| 01 | Shared foundation / Chaithanya coordinating | One schema migration and explicit design decisions |
| 02 | Ankita | #26 #27 #28 accounts, audit, login limiter/security checks |
| 03 | Ashritha | #8 #9 #11 #12 #13 dependencies, deletion, tags, queries, board/list |
| 04 | Nuthan | #16 #18 #19 membership, archive, comments/history, mentions |
| 05 | Chaithanya | #22 #23 #24 #25 reminders, Today, metrics, burndown/CSV |
| 06 | Ashritha, Nuthan review | #29 and shared #31: 1,000 tasks / 20-user load tools and evidence |
| 07 | Nuthan | #32 service-unit checks, quality review and unresolved risks |
| 08 | Chaithanya | #30 browser timing, integrated smoke script and final evidence |

Every package is cumulative **against the immediately preceding merged state**.
It contains only its own file delta, not a whole-repo overwrite. The apply script
checks predecessor content in HEAD and working files. Do not open later package
PRs from old main. Stop if guards report drift; rebase/regenerate deliberately.
No promised zero-conflict outcome if other PRs edit these same paths.

## Day 1
- Back up the development database; keep the local 15432 Compose workaround.
- Merge 01 after schema review/migration checks; merge 02 after auth/permission tests.
- Merge 03 after task query, dependency and delete-confirmation checks.
- Each owner reviews their changes and PR. No bulk `git add .`, no force push.

## Day 2
- Merge 04, then 05, with old Sprint 1 functionality checked on both user accounts.
- Verify removal revokes access, ownership transfer is explicit, mentions exclude
  actor/non-members, and archived projects reject new tasks.
- Configure local Mailtrap sandbox credentials and collect genuine delivery evidence.

## Day 3
- Merge 06, 07, 08 in sequence; run the reproducible verification tools.
- Collect fresh Windows/Docker and Mailtrap evidence; triage OPEN-RISKS.md.
- Wait for CI on each PR and again on merged main. Passing a build is not enough.
- Close only issues whose full acceptance criteria have evidence. #22, #28, #32
  have external checks/risks: do not automatically close all Sprint 2 issues.

## Safe application

Create a fresh feature branch from the newest pulled main **after** its predecessor
PR is merged. Keep personal Docker port changes unstaged (or stash only that file).
Run the package's Apply.ps1 from the repository root. It never installs packages,
migrates a DB, stages files, commits, pushes or edits .env/docker-compose.yml.
Review `git diff` and use only its FILES.txt for staging after verification.

Backend checks (configure a disposable test database; never run destructive test
fixtures against production): `npm ci`, `npx prisma validate`, `npx prisma generate`,
`npx prisma migrate deploy`, `npm test`. Frontend: `npm ci`, `npm test`,
`npm run lint`, `npm run build`. Apply migrations to development only after backup.
Use `docker compose up -d --build` for your local manual application checks.

All features retain the existing light/dark UI, token handling, task-creation
idempotency, notification rules and status workflow. Sprint 2 adds screens rather
than replacing Sprint 1 API contracts.
