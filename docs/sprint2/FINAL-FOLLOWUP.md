# Sprint 2 Follow-up — Implementation and Linux Checks

## Changes reported

The supplied follow-up identifies baseline `85aa4a1b3ae826b5b504e26f3f837b2871bb5079` (PR #57) and describes deferring task workspace mounting, using Prisma relation joins for task listing, refining login throttling and adding optional database injection to service entry points. It also describes a targeted `deepmerge-ts` override for a Prisma configuration dependency. Presence of a description does not independently establish remote merge or CI state.

## Linux evidence

- The original follow-up reports 135 core, 77 notification and 66 frontend tests passed, plus frontend lint/build and Prisma checks. Raw logs were not supplied.
- `evidence/browser-followup-linux.json` records five dashboard renders at 272.00–419.78 ms for 500 tasks and 20 members, with no recorded errors.
- `evidence/load-followup-linux.json` records 20-user p95 values of 381.50 ms list, 79.15 ms search and 234.18 ms filter with no recorded errors; samples were five seconds per operation.
- `evidence/smoke-followup-linux.json` records six checks passing with an authenticated fixture; it does not record an end-to-end registration/login test.

The original audit report claims zero production-only findings and remaining development-tool findings; the actual audit output was not supplied. A major-version override has compatibility risk and is not evidence of a vulnerability-free system. Later Windows and sandbox JSON artifacts are summarized separately in `FINAL-VALIDATION-NOTES.md`. The earlier Windows failures and remaining quality limitations are retained in `OPEN-RISKS.md`.
