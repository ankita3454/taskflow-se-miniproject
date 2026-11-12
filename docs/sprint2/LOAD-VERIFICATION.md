# Task API Load Verification

## Method

Saved artifacts describe Autocannon against an Express listener and real PostgreSQL on the same host, using a single 1,000-task project, 20 distinct authenticated users, closed-loop traffic and five seconds per operation. The p95 is computed from response-event latency samples. There was no excluded warmup. These are short local measurements, not endurance or production-SLA evidence.

## Windows results

| Operation, 20 users | Final run p95 | Expanded run p95 |
|---|---:|---:|
| List | 843.61 ms | 713.80 ms |
| Search | 210.26 ms | 165.13 ms |
| Combined filter | 621.17 ms | 477.11 ms |

`evidence/load-final-windows-4407bd09d4.json` and `evidence/load-extra-windows-ec02c57c45.json` were recorded 2026-11-08. The expanded run also measured individual filters and another search: its slowest 20-user case was date-range filtering at 925.47 ms. All results in these files are below 1,000 ms p95, with zero recorded errors/timeouts/non-2xx. Different runs must not be combined into one sample.

## Earlier Linux reference

`evidence/load-followup-linux.json` records 20-user list/search/filter p95 of 381.50/79.15/234.18 ms; `evidence/load.json` records another earlier Linux run. The original documentation reports an earlier Windows list p95 of 2,319.49 ms, but its raw JSON is not included in this docs archive. A short recorded pass does not negate that historical report or guarantee performance on another machine.
