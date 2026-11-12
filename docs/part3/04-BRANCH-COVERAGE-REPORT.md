# Branch Coverage Report — Part 3

## Meaning and evidence

Branch coverage concerns instrumented decision paths, such as error and success alternatives. A high value is useful but is not proof that all meaningful inputs or requirements were checked. Values below come from the saved coverage summaries, not a new run.

| Evidence in `part3/evidence/` | Scope | Covered / total | Branch coverage |
|---|---|---:|---:|
| `backend-unit-coverage-summary.json` | Baseline selected backend unit subset | 142 / 216 | 65.74% |
| `backend-coverage-summary.json` | Baseline mixed backend suite | 753 / 886 | 84.98% |
| `backend-focused-unit-coverage-summary.json` | Four focused modules | 304 / 321 | 94.70% |
| `backend-unit-improved-coverage-summary.json` | Expanded selected-unit source | 438 / 465 | 94.19% |
| `backend-improved-coverage-summary.json` | Later mixed backend suite | 774 / 902 | 85.80% |
| `backend-sonarqube-unit-analysis-summary.json` | Latest seven service modules, unit-only | 380 / 394 | 96.44% |
| `frontend-coverage-summary.json` | Recorded frontend suite | 609 / 674 | 90.35% |

The baseline branch figures are present in the supplied JSON even though the earlier prose reported them as unavailable. Different source and test selections make these rows unsuitable for a simple trend comparison. The seven-module analysis excludes `src/sprint2`, and the frontend source and raw test output were not supplied. Branch coverage does not replace the STP's per-service **line** criterion or complete security validation.
