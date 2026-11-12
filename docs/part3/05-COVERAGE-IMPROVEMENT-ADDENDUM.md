# Coverage Improvement Addendum

## What changed

The original reports describe additional isolated tests for authentication, projects, tasks, invitations, permissions and notification services. The saved SonarQube summary records the resulting seven-module unit scope at 99.37% line coverage. The earlier selected-unit summary recorded 42.25%, but included a different set of source files; these numbers cannot be presented as a like-for-like percentage-point gain.

The earlier expanded selected-unit summary records `permissionService.js` at 48.21% line coverage; the later seven-service analysis reports 100%. These are observations from separate runs and should be interpreted with their different scopes. The original reports also describe a frontend baseline of 78.15% line coverage and a later saved frontend summary of 97.11%; the suite grew from a reported 66 to 154 tests, and raw baseline evidence was not supplied.

## Interpretation

The additional tests and dependency injection are described in the supplied reports and backend source. The measured seven-service result meets the planned 80% line target for that scope, but does not establish equivalent unit coverage for `src/sprint2` or completion of all planned test cases. For full denominators and sources see `03-CODE-COVERAGE-REPORT.md`; for decision paths see `04-BRANCH-COVERAGE-REPORT.md`.
