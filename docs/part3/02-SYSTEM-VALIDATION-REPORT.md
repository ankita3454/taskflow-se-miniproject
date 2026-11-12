# System Validation Report — Part 3

## Objective and conclusion

This report evaluates TaskFlow as a system against its planned usage and quality criteria, rather than repeating unit coverage tables. The supplied evidence supports several scoped checks; it does **not** establish complete acceptance against the STP. No new validation was performed for this review.

## Recorded observations

| Area | Recorded evidence | Interpretation |
|---|---|---|
| Core functionality | Original reports state that backend core/notification and frontend suites passed on 2026-11-12 | Mixed automated suites; raw execution logs and frontend source were not supplied; the full backend run predated a later permission-service change. |
| Authentication | Original report describes 114/114 missing, invalid and expired-token responses across 38 route declarations | Reported isolated route check without live DB; not a full authorization or input-validation assessment. |
| API response time | `../sprint2/evidence/load-final-windows-4407bd09d4.json` and `load-extra-windows-ec02c57c45.json`, 2026-11-08 | 1,000 tasks, 20 users, five-second samples. Expanded run's worst 20-user p95 was 925.47 ms, below 1 s; no recorded errors. This is not an endurance or production SLA. |
| Dashboard | `../sprint2/evidence/browser-final-windows-7c78f9b314.json`, 2026-11-08 | Five 500-task renders ranged from 637.43 to 979.42 ms, all under 2 s in that setup. An earlier Windows run had two failures. |
| Reminder | `../sprint2/evidence/mailtrap-windows-3b0650c609.json`, 2026-11-08 | First run: 2 sent; repeat: 0 sent and 2 skipped; 2 reminder and 2 notification records; 0 Done-task reminders. Inbox verification is false in JSON; a later user confirmation is reported without screenshot. The artifact does not name the intervals. |
| Usability | `../sprint2/evidence/smoke-windows-local.json` and related smoke files | Projects and Tasks screens passed using an already authenticated fixture; registration/login was not exercised in that scripted walkthrough. A separate three-screen walkthrough was reported but no independent record supplied. |
| Portability | Original reports describe a Windows Docker setup | A separate clean Docker-compatible runtime and its acceptance results are not documented. |

## Assessment against exit criteria

The saved SonarQube summary supports the ≥80% line target for the seven measured `src/services` modules, but not all possible service modules. The documents do not establish execution of all 29 full cases, zero open Sev-1 defects, or completion of every SEC-01–07 security check. The case matrix identifies partial cases; the SRS and STP also contain conflicts noted in the folder README. Pilot-user sign-off, a complete authorized-user security review and a requirement-by-requirement coverage metric were not supplied. These are evidence limitations, not invented failures.
