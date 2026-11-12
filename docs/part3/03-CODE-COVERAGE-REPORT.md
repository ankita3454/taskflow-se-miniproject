# Code Coverage Report — Part 3

## Purpose

Line coverage measures which instrumented lines executed in a particular run; it does not demonstrate correctness or complete requirement coverage. This report uses the saved JSON summaries and separates unit-only from mixed-suite results. No coverage was regenerated for this review.

## Line coverage by recorded scope

| Saved summary / stated run | Scope | Lines covered / total | Coverage |
|---|---|---:|---:|
| `backend-unit-coverage-summary.json`, 2026-11-10 baseline per original report | Selected unit subset, including `src/sprint2` files | 1,051 / 2,487 | 42.25% |
| `backend-coverage-summary.json`, 2026-11-10 baseline per original report | Mixed backend suite | 3,337 / 3,663 | 91.10% |
| `backend-focused-unit-coverage-summary.json`, date unstated | Four selected modules | 1,247 / 1,275 | 97.80% |
| `backend-unit-improved-coverage-summary.json`, date unstated | Expanded selected source | 2,376 / 3,679 | 64.58% |
| `backend-improved-coverage-summary.json`, date unstated | Mixed backend suite | 3,356 / 3,663 | 91.61% |
| `backend-sonarqube-unit-analysis-summary.json`, 2026-11-12 | Seven `src/services` modules, isolated unit scope | 1,582 / 1,592 | 99.37% |
| `frontend-coverage-summary.json`, date unstated in JSON | Recorded frontend suite | 875 / 901 | 97.11% |

All named files are under `part3/evidence/`. Denominators and scope differ; the mixed-suite totals do not establish unit-only coverage. The original report associates the frontend summary with a 154-test run; raw frontend output was not supplied.

## Latest isolated service results

| Module | Line coverage |
|---|---:|
| authService.js | 100.00% |
| invitationService.js | 100.00% |
| notification-read.service.js | 100.00% |
| notification.service.js | 98.96% |
| permissionService.js | 100.00% |
| projectService.js | 100.00% |
| taskService.js | 99.11% |

These percentages and total are in `backend-sonarqube-unit-analysis-summary.json`. The 80% per-module line criterion is met for these seven modules only; separate `src/sprint2/` modules are not part of that unit-only result.

## SonarQube

The supplied summary records a **passed Quality Gate**, analysis `f0fcd650-95bd-4b24-83a8-ac7fa000ee2f`, project `taskflow-backend-unit`, dated 2026-11-12. It reports SonarQube Community Build 26.11.0.134175, SonarScanner 8.4.0.16527 and c8 10.1.3/V8. The original LCOV and server logs were not included; the summary supports only its stated seven-module scope. Branch analysis is in `04-BRANCH-COVERAGE-REPORT.md`.
