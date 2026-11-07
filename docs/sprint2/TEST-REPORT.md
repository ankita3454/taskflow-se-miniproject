# TaskFlow recovery verification — corrected R2 delivery

Baseline: main `9c073d592892ba8561bf4747d3406f79b05eaafb` (PR #50 foundation
already merged). Delivery contains only packages 02–08, applied in numeric order.

## Correction and regression coverage
Package 04 validates project IDs before raw SQL locks in project-role changes,
member removal and archiving. Two new regression tests cover malformed IDs,
controlled 404 responses, authentication, unchanged data and rejection before
opening repository transactions. Both tests failed against the uncorrected
implementation and passed against the corrected implementation.

## Evidence provenance
`evidence/load.json`, `browser.json` and `smoke.json` are preparation measurements
from the original isolated Linux run. They are not Windows, Docker, live Mailtrap
or teammate execution evidence. They have not been relabeled as this revision's
measurements. This R2 bundle contains its own fresh stage results and logs outside
the source payload, in AUDIT-EVIDENCE/ and each ZIP's STAGE-VERIFICATION.md.

The fresh R2 final integrated run passed 128 core plus 77 notification tests
(205 total), and 65 frontend tests, lint and production build. Each cumulative
package stage was installed with npm ci and tested independently against real
PostgreSQL 16.15. PowerShell 7.5.1/Linux apply/reapply/stage and negative guards
also passed. Use the delivered R2 verification summary plus your own local results
and your PR/main CI; these are not Windows/Docker acceptance claims.

## Still pending
Live Mailtrap delivery (#22), new Sprint 2 Docker/second-runtime portability and
legacy repository-mock isolation (#32), and Prisma dependency-security remediation
(#28) are not claimed complete. See OPEN-RISKS.md. No automatic issue closures,
remote commits, pushes, reviews or merges are performed by the delivery bundle.

The pack covers the expanded recovery backlog, including features originally
planned for later sprints; it does not change original sprint deadlines.

## Final follow-up
See FINAL-FOLLOWUP.md and the `*-followup-linux.json` evidence for the later fixes, tests and remaining target-environment checks. The earlier results above remain historical.
