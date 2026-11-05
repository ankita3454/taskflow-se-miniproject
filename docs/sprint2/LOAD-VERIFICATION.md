# NFR-01 and NFR-05 verification (#29, #31)

Run only against a disposable PostgreSQL database with the foundation migration.
From backend after npm ci, with DATABASE_URL and JWT_SECRET configured for that DB:

```powershell
$env:ALLOW_PERFORMANCE_FIXTURES='yes'
$env:LOAD_DURATION_SECONDS='5'
node scripts/sprint2/load.js
Remove-Item Env:ALLOW_PERFORMANCE_FIXTURES
```

Autocannon (submitted test-plan tool) seeds 1,000 tasks and 20 distinct authenticated
members in one project. Tests list, keyword search, combined status/priority/due-sort
filter separately, at 1 and 20 concurrent connections (one token per connection).
Closed-loop, no pipelining, no think time, five measured seconds/operation; no warmup
excluded. Nearest-rank p95 uses all response-event latency samples. Result JSON also
records request count, errors/timeouts/non-2xx, p99 and environment. Any error or
p95 >1,000ms fails the process. Fixtures are removed in finally, only own generated
records. An abrupt process kill may require manual cleanup of Disposable performance
fixtures; never clear unrelated data. Output performance-results/ is gitignored.
LOAD_DURATION_SECONDS can increase duration for a longer local run.

Committed `evidence/load.json` is the actual isolated Linux run, not Windows/Docker
or production evidence. All six operations met the target, no API errors. Same-process
HTTP load generator/API may share CPU: results describe only this documented setup,
not a universal SLA or endurance test. Ashritha owns #29; Nuthan reviews/reruns the
20-user result for #31. Do not invent a second result or duplicate tool versions.
