# TaskFlow Notifications

## Events and recipients

The existing implementation and project decisions describe in-app notices for assignment or reassignment, permitted status changes, comments mentioning project members, and eligible due-date reminders. Unchanged assignments and same-key task-creation retries do not create duplicate assignment notices. Actors do not receive notifications for their own assignment or status action; inaccessible, removed or inactive members are excluded where applicable. Mention handling resolves active project members and deduplicates recipients for one comment.

Notification access is scoped to the authenticated recipient. The supplied original documentation describes a notification bell that polls every five seconds rather than using push; the frontend code was not supplied for this review. Read state is stored, and assignment/status changes and corresponding in-app events are documented as transactional.

## Reminders

The reminder worker uses due-minus-three-day and due-minus-one-day UTC windows. Done or unassigned tasks and inaccessible/inactive assignees are excluded. The claim is unique per task and interval for the task's lifetime, including after due-date or assignee changes. SMTP transport is restricted to a configured Mailtrap sandbox and requires local credentials, which must not be included in reports.

Database claims and SMTP cannot be committed atomically: an ambiguous send may remain UNKNOWN and is not automatically repeated. A stored claim prevents repeated automatic submission but does not prove the recipient received exactly one email. Missing a whole UTC window can also prevent delivery.

## Evidence and boundaries

Backend source includes notification, collaboration and reminder tests. `sprint2/evidence/mailtrap-windows-3b0650c609.json` records two successful sender returns, two skips on the second run, two in-app records and no Done-task reminders; its inbox-verification flag is false and the intervals are not identified. The original system report mentions later user confirmation without an inbox screenshot. See `sprint2/CHAITHANYA.md` for implementation and `part3/02-SYSTEM-VALIDATION-REPORT.md` for the evidence assessment.
