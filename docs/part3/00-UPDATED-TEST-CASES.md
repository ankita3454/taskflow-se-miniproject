# Updated Test Cases and Traceability — Part 3

**Status: working update; not a claim that all 29 full cases passed.**

Source: the supplied SRS/SAD/STP PDF, STP section 13. This matrix summarizes the original reports and names supporting source tests; the existence of a test or a reported suite pass does not independently prove every step of a complete case was executed. Raw full-suite logs and frontend source were not supplied. See `01-UNIT-TEST-REPORT.md` for provenance.

A “supporting check reported passed” is an assertion in the supplied reports, not an independently reproduced result or a complete manual case. Backend test files were inspected, but raw test-run logs and frontend files were not supplied. Evidence paths without a prefix are under `backend/tests/`; referenced frontend paths were not supplied. JSON files are under `docs/sprint2/evidence/`.

| ID | Action | Expected result | Supporting evidence | Result / remaining work |
|---|---|---|---|---|
| TC-01 | Register a new account, then retry the same email | First succeeds; duplicate is rejected | `auth.test.js (registration and duplicate cases)` | Supporting automated checks reported passed |
| TC-02 | Register and inspect stored password and logs | Only bcrypt hash stored; no plaintext | `auth.test.js (bcrypt, plaintext-log and API exposure)` | Supporting automated checks reported passed |
| TC-03 | Log in with valid and invalid credentials | Signed token/success vs generic 401; successful UI navigation | `auth.test.js; frontend/src/App.test.jsx` | Supporting automated checks reported passed; full browser walkthrough not separately recorded |
| TC-04 | Use expired JWT on protected endpoint | 401; frontend returns to login | `auth.test.js; App.test.jsx; 114-case route check` | Supporting automated checks reported passed |
| TC-05 | Call owner-only endpoint as non-owner | 403, no action | `permissions.test.js` | Supporting automated checks reported passed |
| TC-06 | Create valid task, then submit empty title | TODO task created; empty title 400 | `task-creation.test.js` | Supporting automated checks reported passed |
| TC-07 | Exercise sequential transitions and illegal TODO→DONE | Allowed transitions and logs; illegal transition rejected | `task-status.test.js` | Supporting automated checks reported passed; the combined full case sequence and activity log are not separately documented |
| TC-08 | Complete a task with an unfinished blocker | 409; status remains unchanged | `sprint2-tasks.test.js` | Supporting automated checks reported passed |
| TC-09 | Create dependency A→B then try B→A | First accepted; cycle rejected | `sprint2-tasks.test.js` | Supporting automated checks reported passed |
| TC-10 | Delete a task with comments and activities | Task children removed; security audit retained | `sprint2-tasks.test.js` | Supporting automated checks reported passed |
| TC-11 | Search 1,000-task project under test load | Matching results; p95 <1 second | `load-extra-windows-ec02c57c45.json; sprint2-tasks.test.js` | Automated check reported passed; recorded 20-user search p95 below 1 s |
| TC-12 | Apply combined status, priority, assignee filters and sort both ways | Correct intersection and ordering | `sprint2-tasks.test.js` | Supporting automated checks reported passed |
| TC-13 | Switch list/Kanban and return after navigation | Same filtered tasks; view/filter retained | `frontend/src/components/TaskExplorer.test.jsx` | Supporting component test reported passed; full browser case not independently recorded |
| TC-14 | Create project, invite member, accept invitation | Creator owns; invitee becomes member | `projects.test.js; invitations.test.js` | Supporting automated checks reported passed |
| TC-15 | Archive project with tasks and attempt a new task | Creation blocked; existing tasks remain viewable | `sprint2-collaboration.test.js; task-creation.test.js` | Partial: archive/create-block checks reported; visibility of existing tasks is not separately established |
| TC-16 | Invite/remove a member as non-owner | 403 | `permissions.test.js` | Supporting automated checks reported passed |
| TC-17 | Assign a member and attempt non-member assignment | Notification to assignee; invalid assignment rejected | `task-assignment.test.js` | Supporting automated checks reported passed |
| TC-18 | Mention a project member in a comment | Mentioned member receives notification | `sprint2-collaboration.test.js` | Supporting automated checks reported passed |
| TC-19 | Try direct API edit/delete of comment/activity | Immutable; request rejected | `sprint2-collaboration.test.js; frontend Collaboration.test.jsx` | Partial: comment delete and UI checks reported; all direct edit/delete paths are not established |
| TC-20 | Run reminder scheduler twice in the same window | Exactly one per task/interval | `sprint2-reporting.test.js; mailtrap-windows-3b0650c609.json` | Mocked scheduler checks reported passed; saved sandbox JSON records 2 sends, 2 skips on repeat, but does not identify both intervals; inbox flag false (later confirmation reported without screenshot) |
| TC-21 | Mark task Done before reminder window | No reminder sent | `sprint2-reporting.test.js; mailtrap-windows-3b0650c609.json` | Done suppression recorded in sandbox JSON; automated check reported passed |
| TC-22 | Create unread notifications and use the bell | Correct unread count and updates | `NotificationBell.test.jsx; notification.routes.test.js` | Supporting tests reported passed; complete multi-user browser flow is not recorded |
| TC-23 | View dashboard with Done, overdue and in-progress tasks | Correct completion and overdue counts | `sprint2-reporting.test.js; DashboardPanel.test.jsx` | Partial: completion check reported; exact overdue calculation and full case are not established |
| TC-24 | Open dashboard for 500-task project | Render within 2 seconds | `browser-final-windows-7c78f9b314.json` | Five recorded Windows runs passed |
| TC-25 | Export project tasks to CSV | Every row has title, assignee, status, priority and due date | `sprint2-reporting.test.js` | Partial: header and authorization checks reported; all required row values are not established |
| TC-26 | Deactivate, attempt login, reactivate | Inactive cannot log in; data retained; login restored | `sprint2-security.test.js; auth.test.js` | Partial: session invalidation and active-login checks reported; end-to-end data retention is not established |
| TC-27 | Trigger failed login, role change and deactivation | Audit events with actor, type and timestamp | `sprint2-security.test.js` | Partial: failed-login actor is intentionally null; compliance with the STP actor wording and all fields is not established |
| TC-28 | Submit SQL metacharacters and oversized inputs | Safe input handling; bounds enforced server-side | `task-editing.test.js; project-validation.test.js` | Partial: explicit SQL-metacharacter result is not documented; test-plan description boundary conflicts with SRS 2,000-char limit |
| TC-29 | Repeated invalid logins; test 20 concurrent users | 429 after configured limit; p95 under 1 second | `sprint2-security.test.js; load-extra-windows-ec02c57c45.json` | Supporting tests reported passed; team agreement on the limit is not documented |

## Important decisions and gaps

- Project ownership is separate from system role. Task detail editing and assignments are Owner-only under the agreed implementation; do not change permissions to force a test to pass.
- TC-28: STP's >200-character description conflicts with SRS's 2,000-character description limit. The title limit is 200 and the task schema lists 2,000 for description; formal clarification is not recorded.
- TC-27: failed-login audit events intentionally record a null actor for unauthenticated attempts. Whether this meets the STP actor expectation is not documented.
- Test-plan exit criteria include 100% planned cases executed, zero open critical defects, >=80% unit line coverage per service module, and SEC-01–07 passing. These have not all been demonstrated. SEC-05 is discussed in the STP security section, but is not explicitly mapped in its 29-case table. Do not infer full requirement coverage or 100% execution from supporting tests or closed issues.
