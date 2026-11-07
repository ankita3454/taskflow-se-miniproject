# Remaining checks, limitations and dependency risks

## Do not silently close these acceptance gaps
- #22: live Mailtrap sandbox delivery has not been executed; transport is tested with
  injected mail, not fabricated Mailtrap screenshots. Credentials must remain local.
- #32: new Sprint 2 Docker runtime/second-runtime portability check remains pending.
  Legacy Auth/Project/Task modules are not newly refactored to repository factories.
- #28: functional security checks pass, but dependency audit is NOT clean. At package
  preparation, npm audit --omit=dev reports a high deepmerge-ts recursive-object DoS
  advisory through @prisma/config/Prisma 6; the suggested fix is a Prisma major upgrade.
  Do not apply npm audit fix --force blindly (Prisma 7 has compatibility changes).
  Review exposure/upgrade in a focused follow-up with migration/runtime regressions.
  Dev-only tooling also has warnings (Jest/Autocannon chains and frontend ESLint).
  body-parser was updated to 2.4.0 to remove its known production finding; all tests
  were rerun afterward. Rerun audits: the registry/advisory state changes over time.
- #29/#30/#31: timing evidence is isolated local Linux without throttling, five-second
  API samples and five cold-context browser runs. Rerun on your target setup; not a
  claim that every machine meets the same latency.

## Operational limitations (explicit, not hidden)
- Login limiter is in-memory per process; multi-replica needs a shared limiter store.
- SMTP cannot atomically commit with PostgreSQL. CLAIMED/UNKNOWN records need operator
  investigation, never blind replay; at-most-one submission can trade delivery for
  duplicate prevention. SMTP send holds a project lock for up to the transport timeout.
- The scheduler checks exact UTC dates; downtime through an entire window does not
  invent a late catch-up reminder. Product owner should approve any later catch-up policy.
- Audit listing is capped at 1,000 entries, newest first; no pagination/retention purge
  was added to scope. Operators needing full export must design that separately.
- Burndown reconstructs recorded history from TODO; direct DB imports lacking status
  logs cannot produce accurate historical actuals. Deletion removes that task from scope.
- Task browser dependency chooser contains visible filtered tasks. Clear filters to
  choose other blockers. No cross-project dependencies or drag/drop were invented.

## Retested defects found during preparation
- Dashboard integration syntax and missing screen mounts corrected; lint/build/UI
  tests pass. No standalone build-success claim substituted for feature tests.
- Existing activity rollback test used an unauthorised actor as a failing-write
  mechanism. Replaced with a real activity constraint failure, preserving rollback
  assertions and keeping the strengthened authorisation check.
- Browser walkthrough selector matched a hidden second project label. Scoped the
  test to the visible project card; added finally cleanup lookup; smoke rerun passed.

- Login throttling was moved ahead of JSON parsing so malformed JSON cannot bypass
  the limit; the security API regression test verifies 429 for that bypass attempt.
