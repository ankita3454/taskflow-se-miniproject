# Sprint 2 Implementation Decisions

These are design decisions recorded in the original recovery documentation. They explain implementation behavior and do not retroactively change the approved synopsis or SRS.

1. Dependencies are same-project; locking serializes graph operations and task completion/deletion.
2. Only the canonical project Owner deletes a task. Task comments, activity and tag links cascade under F2-REQ-08; shared tags and a separate security audit remain. This is treated as an exception to F5-REQ-07's immutability wording, pending formal reconciliation.
3. Tags are project-scoped, trimmed and case-insensitively unique; mentions use member email addresses and notify each eligible non-actor recipient once per comment.
4. A project has one canonical Owner. Ownership transfer is atomic and separate from system roles. Removal revokes access without erasing task attribution.
5. Today contains accessible assigned unfinished tasks due today/overdue or in review. Archived projects remain readable. Completion is Done divided by existing project tasks; an empty project is 0%.
6. A product sprint has explicit inclusive dates. Burndown planned values use task due dates; actual values use recorded state history and future actuals remain blank. Data without history cannot reconstruct it.
7. Date-only reminder boundaries are UTC. Uniqueness is per task/interval even after later task edits. Due-minus-3 and due-minus-1 are exact windows; ambiguous SMTP outcomes are retained, not retried automatically. This is not an exactly-once delivery guarantee.
8. Only a Mailtrap sandbox is used for SMTP. Credentials belong in local environment configuration, never in documentation or source control.
9. Failed-login audit actor is null; credentials and submitted email values are not intentionally logged. The login limiter is process-local, with independent account/IP buckets and separate malformed-input handling.
10. Deactivation invalidates old sessions; reactivation requires a fresh login. Evidence from performance, Docker or user acceptance must be attributed to the actual environment and must not be inferred from unit tests.
