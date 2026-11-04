# Nuthan integration: collaboration (#16, #18, #19)

Project settings screen: only the canonical project Owner can remove members,
transfer ownership or archive (all confirmed in UI). Exactly one canonical Owner;
transfer demotes the former Owner to Member and does not change system roles.
Removal retains task assignment/history attribution but revokes project access.
Existing archived data remains viewable; new task creation is rejected.

- PATCH `/api/v1/projects/:id/members/:userId` with projectRole Owner/Member.
- DELETE same member route; POST `/api/v1/projects/:id/archive`.
- POST `/api/v1/tasks/:id/comments` with body, 1–2,000 chars.
- GET `/api/v1/tasks/:id/history`: chronological comments and activity, actor names
  and timestamps. No separate comment/activity edit/delete routes.

Open Task browser > Details to comment. Mention an active project member using
`@their-email-address`. Repeated recipients deduplicate per comment, actor and
non-members are excluded, comment+activity+notification commit together. Text is
rendered as literal React text, not HTML. Deleting the parent task is the documented
retention exception in DECISIONS.md. Project locks serialize access-sensitive writes.

API coverage includes mentions/history/limits, access revocation, archive, canonical
ownership transfer and unchanged system roles. UI coverage includes literal text,
comment posting and confirmation/Owner-only controls. Load/quality evidence follows
in packages 06 and 07; #32 portability still needs a second Docker-runtime check.

## Corrected delivery: project-ID validation

Project role updates, member removal and archiving validate projectId before
opening a transaction or acquiring a raw-SQL UUID lock. Malformed IDs return the
shared controlled 404 NOT_FOUND response; unauthenticated requests still return
401. Regression tests cover all three routes, unchanged project/membership/audit
data, and repository-injected checks proving malformed IDs never open storage
transactions. No project-role, ownership-transfer or archive rules were changed.
