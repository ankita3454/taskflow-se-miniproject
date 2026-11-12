# Browser Verification — Dashboard and Smoke Checks

## Dashboard measurement

The saved browser artifacts describe five fresh contexts with cold HTTP cache, a production Vite preview and no CPU/network throttling or concurrent load. Timing includes navigation, token restore, data retrieval, rendering metrics/workload and SVG burndown, then two animation frames. The fixture contains 500 tasks and 20 members, with expected completion 125/500 (25%).

| Evidence | Environment/date | Five timings (ms) | Result against 2 s |
|---|---|---|---|
| `evidence/browser-windows-local.json` | Windows, 2026-11-07 | 1708.70, 1853.44, 1819.49, 2175.83, 2047.97 | 3 of 5 passed; 2 failed |
| `evidence/browser-followup-linux.json` | Linux, 2026-11-07 | 419.78, 286.67, 301.75, 272.00, 294.23 | 5 of 5 passed |
| `evidence/browser-final-windows-7c78f9b314.json` | Windows, 2026-11-08 | 979.42, 934.67, 637.43, 721.97, 782.83 | 5 of 5 passed |

All three artifacts record no browser errors. The later Windows result is separate from the earlier failed run, which remains part of the history.

## Integrated smoke

`evidence/smoke-windows-local.json`, `smoke-followup-linux.json` and `smoke.json` record six passing checks: project/first task, task details/comment history, project settings, Today, Administration and no JavaScript errors. The first flow used an already authenticated disposable account and two primary work screens. Registration and login were not tested end-to-end by that smoke script. These records do not establish independent user acceptance or portability across Docker runtimes.
