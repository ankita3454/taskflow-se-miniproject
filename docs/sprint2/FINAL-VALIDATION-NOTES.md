# Final Validation Notes — Recorded Windows Evidence

## Performance

On 2026-11-08, `evidence/load-final-windows-4407bd09d4.json` records a 1,000-task dataset and 20 concurrent authenticated users: p95 843.61 ms for list, 210.26 ms for search and 621.17 ms for the combined filter, with zero recorded errors, timeouts and non-2xx responses. `evidence/load-extra-windows-ec02c57c45.json` records additional search/filter variants; the highest 20-user p95 was 925.47 ms, with zero recorded errors. Each operation was sampled for five seconds on the stated local setup.

`evidence/browser-final-windows-7c78f9b314.json` records five 500-task dashboard renders: 979.42, 934.67, 637.43, 721.97 and 782.83 ms. Each was below two seconds, with no recorded browser errors. These artifacts are present in the supplied docs; older notes requesting their attachment were superseded. Earlier Windows dashboard timing had two runs over two seconds and remains recorded in `browser-windows-local.json`.

## Sandbox reminders

`evidence/mailtrap-windows-3b0650c609.json` records two sends on the first run, two skips on the second, two reminder records, two in-app records and no reminder for the Done task. Its inbox-verification flag is false and it does not specify which intervals were exercised. The original system report mentions subsequent user confirmation without a screenshot. The original follow-up also reports an earlier SMTP 550/UNKNOWN outcome; uncertainty and recovery limitations are documented in `OPEN-RISKS.md`.

These results establish only the recorded local checks. They do not establish complete system acceptance, multi-runtime portability, exhaustive security review or a production latency guarantee.
