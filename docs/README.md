# TaskFlow documentation — review and guide

**Project:** TM-2026-02 | **Team:** 2 | **Course:** UE24CS341A, PES University

This folder is a rewritten set of the supplied reports. The synopsis and SRS/SAD/STP are the design and test-plan baselines; the saved JSON and original reports describe earlier observations. No tests or benchmarks were run for this documentation review. Existing evidence remains in `part3/evidence/` and `sprint2/evidence/`; backend source and tests were inspected statically. The frontend source, full test logs, CI logs, pilot sign-off and standalone test-case document were not supplied.

## Report guide

- `part3/00` maps the 29 planned cases to existing support and remaining gaps. `01` describes unit and suite execution reports. `02` evaluates system validation. `03` explains line coverage and SonarQube. `04` interprets branch coverage. `05` explains changes in coverage scope rather than repeating all metrics.
- `sprint2/ANKITA`, `ASHRITHA`, `NUTHAN` and `CHAITHANYA` describe individual functional contributions. `DECISIONS` records design choices; `RECOVERY-PLAN` records the historical plan; `TEST-REPORT` summarizes recovery verification; `FINAL-FOLLOWUP` and `FINAL-VALIDATION-NOTES` distinguish later follow-ups. `LOAD-VERIFICATION` and `BROWSER-VERIFICATION` present performance and browser evidence. `QUALITY-REVIEW` assesses quality, and `OPEN-RISKS` contains unresolved limitations.
- `PERMISSIONS.md` and `NOTIFICATIONS.md` describe cross-cutting application behaviour.

## Main corrections

1. The saved latest Windows benchmark and Mailtrap artifacts supersede earlier notes that said those artifacts were absent. The original failed Windows benchmark remains historical. Mailtrap inbox verification is marked **false** in the saved JSON; a later original report mentions user confirmation, but no inbox screenshot was supplied. The JSON does not establish which reminder intervals were exercised.
2. Isolated service-unit coverage is 99.37% for seven `src/services` modules, not for the whole backend or the separate `src/sprint2` modules. Its SonarQube Quality Gate is recorded as passed in the supplied summary. No independent full run logs or original LCOV were supplied.
3. Frontend 97.11% line and 90.35% branch coverage are supported by the saved summary, but the frontend files and raw runner output were not included. Full-suite counts are reported by the original documents, not independently verified by execution logs.
4. F2-REQ-08 specifies cascading deletion of task comments and activity; F5-REQ-07 describes them as immutable. The implementation decision treats task deletion as an exception; this is a documented interpretation, not an approved SRS amendment.
5. TC-28 uses a >200-character description, while the SRS specifies a 2,000-character description limit. SEC-05 is described in the STP security section but is not explicitly mapped to an individual case in its 29-case table. Full requirement traceability and the STP exit criteria are not established by these documents.
6. Reminder claims and SMTP cannot guarantee exactly-once delivery. The implementation favours at-most-one automatic submission, with uncertain outcomes retained for investigation.

Original filenames and evidence files are retained so the revised folder can be compared with the supplied archive. Recorded assertions are not upgraded into new test results, and missing evidence is described rather than filled in with invented outcomes.
