# Sprint 2 Recovery Verification Report

## Scope

This is a historical summary of recovery verification described in the supplied reports. No tests were run for the documentation review, and stage logs referenced by the original recovery report were not included in the supplied archive.

## Reported test runs

| Reported stage | Backend core | Notifications | Frontend | Other notes |
|---|---:|---:|---:|---|
| Corrected R2 integrated stage | 128 passed | 77 passed | 65 passed | Original report also states frontend lint/build and package-stage checks passed on isolated Linux/PostgreSQL 16.15. |
| Later security/isolation follow-up | 135 passed | 77 passed | 66 passed | Original follow-up reports lint/build passing and describes additional changes. |
| 2026-11-12 later full suite | 181 passed | 77 passed | 154 passed | As reported in Part 3; backend full run predates a later permission-service change. |

These are separate historical runs, not additive test counts. Original documentation says malformed-project-ID regression cases failed before the correction and passed afterward; the backend source contains those cases, but no raw before/after logs were supplied.

## Preserved machine-readable evidence

`evidence/load.json`, `browser.json` and `smoke.json` describe earlier isolated Linux checks, not Windows/Docker results. Later `*-followup-linux.json` and Windows artifacts describe their own runs and must not be relabeled as the R2 stage. See the dedicated load/browser reports and Part 3 system validation for interpretation. This report does not assert remote CI success, PR closure or full STP acceptance.
