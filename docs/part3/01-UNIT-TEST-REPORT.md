# Unit Test Report — Part 3

## Purpose and scope

This report records the test counts stated in the supplied reports. Unit tests isolate service logic; the core and notification suite totals below also include API and integration tests and should not be described as unit-only results. Source test files were supplied for the backend, but the original console/CI logs and frontend source were not supplied. No tests were run during this review.

## Reported runs

| Recorded date | Suite | Passed | Failed | Evidence and scope |
|---|---|---:|---:|---|
| 2026-11-10 | Backend core | 138 | 0 | Original report; mixed unit/API/integration |
| 2026-11-10 | Notifications | 77 | 0 | Original report; mixed scope |
| 2026-11-10 | Frontend | 66 | 0 | Original report; 8 files |
| 2026-11-12 | Backend core | 181 | 0 | Original report; mixed scope, before later permission-service testability change |
| 2026-11-12 | Notifications | 77 | 0 | Original report; mixed scope |
| 2026-11-12 | Frontend | 154 | 0 | Original report; 14 files |
| 2026-11-12 | Isolated backend service unit | 98 | 0 | 53 Node and 45 Jest; saved SonarQube summary records these counts |
| 2026-11-12 | Permission regression | 27 | 0 | Original report; includes 7 cases also counted in the isolated run |

The earlier baseline is reported as using a disposable PostgreSQL database on Amazon Linux (Node 24.22.1 and PostgreSQL 16.15). The original report states that the later full backend run used a Windows checkout. After the permission-service change, the isolated and permission regression runs were reported passing; a later complete backend run is not documented.

## Isolated service-unit result

The saved `evidence/backend-sonarqube-unit-analysis-summary.json` records **1,582/1,592 lines (99.37%)** and **380/394 branches (96.44%)** across seven `backend/src/services/` modules, using mocked persistence. Each of those seven modules exceeds the 80% line target. The original report says c8/V8 generated the LCOV subsequently analyzed by SonarQube; the saved summary reports its Quality Gate passed. The LCOV and full scanner log were not supplied. The separate `src/sprint2/` modules are outside this measurement.

The case-by-case status is in `00-UPDATED-TEST-CASES.md`, and detailed coverage scope is in `03-CODE-COVERAGE-REPORT.md`. A reported passing suite does not establish that all 29 cases, all security checks or the complete STP exit criteria passed.
