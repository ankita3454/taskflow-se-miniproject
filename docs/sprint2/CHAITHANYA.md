# Chaithanya integration: reminders and reporting (#22, #23, #24, #25)

Today and Project dashboard are new sidebar screens. Today is personal assigned
unfinished tasks due today/overdue UTC OR In Review, restricted to accessible projects.
Dashboard metrics: Done/total completion (0% empty), overdue excluding Done, open
workloads for each member including zero. No task archive feature was invented.
Owner sets explicit inclusive product sprint dates (max 90 days); planned remaining
comes from due dates; actual remaining uses recorded status history. Future actuals
are null. No dates configured means setup instructions. Direct DB imports without
activity history cannot reconstruct actuals. Export is Owner-only project-scoped CSV
with escaping and formula-injection protection.

Routes: GET `/dashboard/today`, GET `/projects/:id/dashboard`, PUT
`/projects/:id/sprint` with start/end YYYY-MM-DD, GET `/projects/:id/tasks.csv`,
all below `/api/v1`, all authenticated.

## Mailtrap sandbox configuration, never committed

Reminders are OFF by default. For Docker copy `docker-compose.mailtrap.example.yml`
to an ignored local override or explicitly pass it as a second Compose file. Set
MAILTRAP_USER and MAILTRAP_PASSWORD in the root local .env (Mailtrap sandbox SMTP
credentials, not account login). Leave existing POSTGRES/JWT settings and 15432 host
port alone. Start with:
`docker compose -f docker-compose.yml -f docker-compose.mailtrap.example.yml up -d --build`
The example enables the worker and supplies sandbox hostname/port. It changes no
base port, volume or existing backend DATABASE_URL. Use only Mailtrap sandbox.
For local backend execution set REMINDERS_ENABLED=true and the same SMTP variables
in backend/.env instead. No real external email transport is allowed by this code.

Worker checks each minute, due-minus-3 and due-minus-1 UTC dates. Eligible active
assignee must still belong to the project; Done/unassigned are excluded. A durable
(task, interval) claim and in-app notification commit before SMTP submission.
SENT means transport returned success; UNKNOWN means ambiguous failure, no automatic
resend. Existing claims are not reset by due-date/assignee edits. A crash before send
can leave CLAIMED: inspect before intervention; do not blindly delete claims.
SMTP and DB cannot guarantee atomic exactly-once delivery. No delivery guarantee.

Manual evidence for #22: create an assigned not-Done task due 3 UTC days out; run
`npm run reminders:once` twice in backend with configured sandbox credentials; verify
one captured Mailtrap message, one in-app notice and one Reminder for interval 3.
Repeat at interval 1 (use a separate task/due date or the real later day). Verify a
Done task gets none. Redact credentials in screenshots. Actual Mailtrap acceptance
is pending until this is done. Mock-mail concurrency/timing tests already pass.
#30 production-browser performance verification follows in package 08.

## Mailtrap free-tier pacing follow-up
Mailtrap's free sandbox accepts one email per 10 seconds. The sandbox sender now
serializes attempts in each process, leaving at least 10.5 seconds between completed
attempts. Waiting occurs before the sending transaction opens, so that delay does not
hold a project lock. The task/interval claim remains durable and an ambiguous delivery
is not retried automatically. This in-process limiter does not coordinate multiple
backend processes or external senders sharing the same sandbox; use a single worker or
add a shared rate limiter for that deployment. SMTP quota and other failures can still
produce an UNKNOWN claim that requires investigation. Live sandbox retest is required.
