# Open Risks and Evidence Limitations

| Area | Current documented position | Risk or limitation |
|---|---|---|
| Reminder delivery | Saved live sender summary records 2 sends and 2 skips; inbox flag false. Original report mentions later user confirmation without screenshot. | Intervals are not identified in the JSON; SMTP and database cannot ensure exactly-once delivery. CLAIMED/UNKNOWN outcomes need investigation. |
| Reminder schedule | Exact due-minus-3 and due-minus-1 UTC dates | Downtime covering an entire window may cause a missed reminder. Process-local pacing does not coordinate multiple workers. |
| Windows performance | Later saved load and dashboard runs met their local thresholds | Short samples and a specific machine do not prove production performance. Earlier Windows dashboard evidence includes two failures; the original report also describes an earlier slow task-list run. |
| Portability | Windows Docker operation and Linux local runs are described | A separate clean Docker-compatible runtime and full workflow evidence are not supplied. |
| Login security | In-memory per-IP/email limiter; malformed JSON handled separately | Not distributed or global per-account protection; proxy and multi-instance deployment require appropriate design. |
| Dependencies | Original report says production audit had zero findings but development-tool findings remained; Prisma override applied | Raw audit logs absent; override crosses a pinned major version and has compatibility risk. Zero findings at one point is not zero security risk. |
| Coverage | 99.37% unit-only line coverage for seven `src/services` modules | Does not extend to separate `src/sprint2` modules; coverage is not functional acceptance. |
| Audit/history | Security audit separate from task activity; audit listing capped at 1,000 | Parent task deletion removes task-level comments/activity, conflicting with absolute immutability wording; security audit does not retain full task history. |
| Burndown | Reconstructs recorded status history from TODO | Imported tasks lacking activity and deleted tasks may make historical charts incomplete. |
| Traceability and acceptance | Representative tests and partial evidence exist | Full 29-case execution, all SEC checks, zero open Sev-1 defects and complete SRS requirement mapping are not demonstrated. TC-28's description boundary conflicts with the SRS. |
| Frontend verification | Saved coverage summary and browser JSON included | Frontend source, full runner logs, screenshots for the stated inbox confirmation and independent pilot sign-off were not supplied. |

These items are documented limitations rather than claims that a new test failed. No additional tests were run in preparing this rewrite.
