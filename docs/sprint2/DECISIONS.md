# Sprint 2 recovery implementation decisions

This is recovery work after the original Sprint 2 deadline. Do not retrospectively
change the original sprint dates or claim work was completed by that deadline.
Use a separate three-day recovery plan, actual PR timestamps, and actual evidence.

These are explicit implementation decisions where the SRS is silent, not quotations
from the SRS. They were authorized by the project coordinator in the preparation chat.

- Dependencies are same-project only. A project-level transaction lock serializes graph
  mutation with completion/deletion, preventing concurrent cycle and completion races.
- Only canonical Project.ownerId may delete a task. A confirmed parent-task deletion
  is the explicit F2-REQ-08 exception to comment/activity retention. Shared tags stay.
  A retained security audit entry records the destructive action without task contents.
- Tags belong to one project; names are 1–80 trimmed characters, case-insensitively unique.
- Mentions use @email (case-insensitive) and resolve only active project members.
  Repeated mentions notify each recipient once per comment. Self-mentions are suppressed.
- Project roles are Member/Owner. Promoting a member to Owner explicitly transfers
  canonical ownership atomically, demoting the previous owner to Member. The sole owner
  cannot be removed/demoted without a transfer. This does not change system roles.
- Removing a member retains existing assignment attribution but immediately revokes
  project access. Reassignment remains available to the Owner. No new reminders or mention
  notifications are sent to removed/inactive members.
- Today is personal: unfinished tasks assigned to the caller, in accessible projects,
  with due date <= today's UTC date OR status In Review. Archived projects stay viewable.
- Dashboard denominator is all existing tasks in the selected project; there is no invented
  task-archive feature. Empty project completion is 0%; Done tasks are never overdue/open.
- Product sprint dates are explicit per-project configuration, separate from GitHub sprint
  dates and the three-day recovery window. No fabricated sprint dates or historical values.
  Burndown scope is tasks due within configured inclusive dates; the series shows planned
  remaining task counts by due date and actual remaining reconstructed from recorded status
  activity. Tasks start TODO; activity history determines later status. Future actual values
  are null. Direct database imports without status history cannot yield reliable actuals.
  No dates configured means a clear setup state, not a made-up chart.
- All date-only boundaries are UTC. Reminders are eligible on exact due-minus-3/minus-1
  UTC dates. Unassigned, Done, inactive or removed assignees are excluded.
- Reminder uniqueness is task + interval for the lifetime of that task, even after a due-date
  or assignee change. SMTP cannot provide atomic exactly-once delivery with PostgreSQL.
  A durable pre-send claim prevents duplicate submissions; ambiguous transport failures are
  retained for operator inspection, not automatically resent. Do not claim guaranteed delivery.
- Only Mailtrap sandbox SMTP is permitted. Credentials are environment configuration,
  never included in a ZIP or committed. Actual Mailtrap evidence must be collected separately.
- Failed-login audit actor is null (unauthenticated), including known-email failures; no
  invented user is attributed. No passwords, hashes, email inputs or token values are logged.
- Login limit defaults to 10 failed or in-flight attempts per IP and normalized email per
  15 minutes, with Retry-After. Malformed JSON has a separate IP bucket; successful logins
  release reservations. This bounded, single-process store is not a distributed defense.
- Deactivation increments a session version. Reactivation requires fresh login; old sessions
  never become valid again. Legacy tokens without a version are treated as version zero.
- Functional tests are not performance/portability evidence. Hardware, load dataset, observed
  timing, Docker runtime and Mailtrap outcomes must be reported honestly after running them.
