# Chaithanya B — Reminders and Progress Reporting

**Feature ownership:** F6 notifications/reminders; F7 dashboard and progress reports. Testing/CI and SonarQube are secondary responsibilities.

## Reminder design

The worker selects eligible unfinished assigned tasks on the exact due-minus-three-day and due-minus-one-day UTC dates. Active project membership is required. A durable task/interval claim and an in-app notice are recorded; ambiguous SMTP outcomes are not automatically retried. Mailtrap sandbox sends are paced locally, but multiple workers or external senders do not share that limiter. Since the database and SMTP cannot share an atomic transaction, exactly-once email delivery is not guaranteed.

The 2026-11-08 `evidence/mailtrap-windows-3b0650c609.json` records 2 sends in the first run, 0 sends and 2 skips in the second, 2 in-app notifications and no reminder for a Done task. The file does not identify both intervals and sets `sandboxInboxManuallyVerified` to false. A later user confirmation is reported in the original validation document; no inbox screenshot was supplied. A previous live attempt with an SMTP 550/UNKNOWN outcome is described in the original follow-up.

## Dashboard and reports

The Today view is documented as assigned unfinished work in accessible projects that is due/overdue or in review. The project dashboard includes completion, overdue counts and open workload by member. Sprint dates are explicit; the burndown uses due dates for planned remaining and recorded status history for actual remaining. Imported tasks without history cannot yield reliable historical actuals. CSV export is project-scoped and Owner-only, with escaping and formula-injection protection described in the original report.

`backend/src/sprint2/dashboard.js`, `reminders.js` and `tests/sprint2-reporting.test.js` provide the backend evidence. Dashboard performance is presented in `BROWSER-VERIFICATION.md`; full CSV row-by-row and browser workflow acceptance are not established by the supplied records.
