# TaskFlow Permission Rules

## Purpose

TaskFlow separates a user's system role from their access to an individual project. The following summarizes the supplied backend middleware, route definitions and Sprint 2 decisions; it is not a new security-test result.

## System and project roles

The system roles are Member, Owner and Admin. Admin controls system-wide user administration; a system role alone does not grant access to an unrelated project. Each project has one canonical owner identified by `Project.ownerId`. Project membership grants access to project data; a stored membership role by itself is not a substitute for the canonical owner check. An authorized ownership transfer updates the canonical owner and membership roles without changing system roles.

| Action | Documented authority |
|---|---|
| Access a protected endpoint | Active authenticated user |
| View a project and create tasks | Project member, subject to project state |
| Invite members, remove members, transfer ownership, archive | Canonical project Owner |
| View a task | Member of the task's project |
| Assign or reassign a task | Project Owner |
| Edit task details | Project Owner before Done |
| Change task status | Current project-member assignee or project Owner, subject to transition and dependency rules |
| Administer accounts and view security audit | System Admin |
| Accept or decline an invitation | Intended invitee |

A removed member loses project access; existing task attribution is retained. Authentication re-reads account state, and the documented session-version mechanism invalidates prior sessions after deactivation. Permission failures use controlled responses; exact error precedence depends on the route and whether the resource is identifiable. An archived project's existing data remains viewable, but new task creation is blocked.

## Implementation and evidence

`backend/src/middleware/auth.js`, `backend/src/middleware/permissions.js`, `backend/src/services/permissionService.js`, task/invitation routes, and `backend/src/sprint2/collaboration.js` provide the relevant checks. Backend test files such as `permissions.test.js`, `invitations.test.js`, and `sprint2-collaboration.test.js` describe negative and role-specific cases. Their existence is not proof that all endpoints and roles were exhaustively validated. See `part3/00-UPDATED-TEST-CASES.md` for the evidence boundary.
