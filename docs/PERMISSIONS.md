# TaskFlow permission rules

Source: SRS Section 6.5 (Business Rules), F1-REQ-07/08/09, F4-REQ-07,
F8-REQ-02/05 and SEC-02. Implemented for issue #3.

## Two kinds of role

**System role** (`User.role`): every user has exactly one of `MEMBER`
(the default), `OWNER` or `ADMIN`. Only an Administrator can change it.

**Project Owner**: each project has exactly one Owner, the user in
`Project.ownerId` (the creator, F4-REQ-01). Everyone else in
`ProjectMember` is a member. `ProjectMember.projectRole` never grants Owner
rights, even if it says `"Owner"`.

A system role never grants rights inside a project. A user whose system
role is `OWNER` or `ADMIN` has no access to a project they aren't part of.

## Who can do what

| Action | Allowed | Check to use | Otherwise |
|---|---|---|---|
| Any protected endpoint | A logged-in, active user | `requireAuth` | 401 |
| View a project, create tasks in it | Members of that project (incl. its Owner) | `requireProjectMember()` | 403 |
| Invite, remove or change a member's project role | That project's Owner | `requireProjectOwner()` | 403 |
| Accept or decline a project invitation | The user whose e-mail matches the invitation | Invitation service ownership check | 403 |
| Archive a project | That project's Owner | `requireProjectOwner()` | 403 |
| View a task | Members of the task's project | `requireTaskMember()` | 403 |
| Assign or reassign a task | The Owner of the task's project | `requireTaskProjectOwner()` | 403 |
| Change a task's status | The task's assignee (while still a project member), or the Owner of its project | `requireTaskStatusChange()` | 403 |
| Deactivate/reactivate a user, change a system role, user management, audit log | Administrators | `requireRole("ADMIN")` | 403 |

An unknown or malformed project/task ID returns 404. A rejected request
never reaches the route handler, so nothing is changed.

## How it's enforced

- `requireAuth` (`backend/src/middleware/auth.js`) checks the JWT, then
  reads the user from the database **on every request**. A role change
  applies to the user's very next request (F1-REQ-07), and a deactivated
  user's existing tokens stop working immediately (F8-REQ-02).
- `requireRole(...)` (same file) checks the system role.
- The project and task checks are in `backend/src/middleware/permissions.js`
  and use `backend/src/services/permissionService.js`. Each check reads the
  project or task ID from the route parameter (`:projectId`, `:taskId`) or,
  if absent, from the JSON body. Pass `{ param: "id" }` to use another name.
- On success they attach `req.project`, `req.projectAccess`
  (`{ isOwner, isMember }`) and, for task checks, `req.task`, so handlers
  don't need to load them again.

## Using the checks in a route

```js
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  requireProjectMember,
  requireProjectOwner,
  requireTaskProjectOwner,
  requireTaskStatusChange,
} from "../middleware/permissions.js";

router.get("/projects/:projectId", requireAuth, requireProjectMember(), getProject);
router.post("/projects/:projectId/archive", requireAuth, requireProjectOwner(), archiveProject);
router.post("/tasks", requireAuth, requireProjectMember(), createTask); // projectId in body
router.post("/tasks/:taskId/assign", requireAuth, requireTaskProjectOwner(), assignTask);
router.patch("/tasks/:taskId/status", requireAuth, requireTaskStatusChange(), changeStatus);
router.post("/admin/users/:id/deactivate", requireAuth, requireRole("ADMIN"), deactivateUser);
```

## Tests

`backend/tests/permissions.test.js` covers TC-05, TC-16, cross-project
access, the single-Owner rule, task-status and assignment permissions
(including assignees removed from the project), Admin-only actions, and
immediate role changes and deactivation. Run with `npm test`; CI runs it on
every push.

`backend/tests/invitations.test.js` covers Owner-only invitation creation,
invitee inbox visibility, invitation response ownership, acceptance with
Member membership, and declining without membership.

## Not covered here

- Applying these checks to the real project, task and admin endpoints.
  That happens in F2, F4, F5 and F8 as those endpoints are built.
- Business rules that aren't about who may act: no new tasks in an archived
  project (F4-REQ-06), and no Done while a blocking dependency is open.
  Those belong in the project and task services.
