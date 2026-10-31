# In-app notifications (#20 and #21)

## Integrated events
- Owner assignment/reassignment creates one notification for the new assignee, unless the Owner assigns the task to themselves.
- Repeating an unchanged assignment creates neither a new notification nor a new activity entry.
- Creating a task with an initial assignee also creates an assignment notification, except self-assignment.
- Same-key task-creation retries reuse the task and do not create another notification.
- An actual allowed status change by the assignee notifies the canonical Project.ownerId. A status change by that Project Owner notifies the current assignee only while they remain in the project.
- No assignment/status notification is sent to its actor. If Owner and assignee are the same person, status changes create no notification. The authenticated actor ID is passed explicitly from task workflows.
- Recipient routing is the team-selected behaviour clarification; it does not change who is authorized to change status or the allowed transitions.
- Unassigned tasks have no notification recipient. A removed assignee does not receive a new project notification; the Owner's legitimate status update still succeeds.
- Task changes, corresponding activity records and event notifications share one transaction. Notification-write failures roll back the successful-event changes.

## Recipient access
All notification APIs require a valid JWT. Listing, counts, single-read and mark-all-read are scoped to the authenticated recipient. A foreign recipient's ID returns the same 404 as an unknown ID on single-read.

## Same-session updates
The bell polls the authenticated list every five seconds, without reloading the page. This is polling, not WebSocket/SSE push: new-event visibility normally takes up to the next poll plus request latency. Counts are derived from that same returned list. Read actions update the UI after server success; stale in-flight polls cannot undo a newer read state. Read state is persisted in PostgreSQL.

## Tests
Backend: `npm test` runs all node:test suites plus the Jest notification suites. The runner deliberately separates the frameworks and discovers future core test files instead of dropping them from CI.
Frontend: `npm test`, `npm run lint`, `npm run build`.
The workflow suite exercises real task HTTP endpoints, assignment/status/activity transactions, recipient isolation, task-creation retry prevention and rollback fault injection.
The bell suite covers polling, single/all read, remount persistence, 401 handling, refresh failure recovery, stale response protection and unmount cleanup.

## Remaining Sprint 2 work
Comment-mention notification helpers are available, but actual comment/mention integration belongs to #19. It must be tested with the real comment workflow when that feature is implemented. Due-date email reminders belong to #22; neither SMTP nor reminder scheduling is implemented by this PR.

## Verification boundary
The combined candidate was tested locally on isolated PostgreSQL and in a local headless browser. The target branch's CI and the user's Docker deployment must be checked after applying the packages; local results are not proof that the remote branch already contains these changes.
