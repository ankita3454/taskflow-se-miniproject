# Final verification follow-up

The first live Mailtrap sandbox run produced one successful delivery and one UNKNOWN
claim with SMTP 550. A sanitized diagnostic identified the sandbox rate limit. The
follow-up adds process-local pacing without automatically retrying uncertain sends.
Existing claims must not be reset blindly. A fresh live sandbox retest is required.

The Windows 1,000-task / 20-user run after PR #58 reported list p95 843.612 ms,
search p95 210.264 ms, and combined filter p95 621.173 ms, with zero errors,
timeouts and non-2xx responses. The Windows 500-task browser runs were 979.42,
934.67, 637.43, 721.97 and 782.83 ms, with no recorded errors. These are
user-reported results; attach the matching raw JSON artifacts before closing the
performance issues. The earlier Windows failures remain in repository history.

Set `LOAD_EXTRA_FILTERS=yes` for an expanded load run covering individual status,
priority, assignee, tag, from/to dates and date-range filters, plus a second search.
Its measured results still need to be recorded. The fixture creates a test tag and
100 test tag assignments in the disposable database and cleans them up afterward.
Use a dedicated disposable database; never run this against the application database.

The quality/portability and manual security checks and evidence remain to be completed.
See OPEN-RISKS.md and QUALITY-REVIEW.md; passing one benchmark is not proof of all SRS
requirements. Never commit .env, local Compose overrides or secrets.
