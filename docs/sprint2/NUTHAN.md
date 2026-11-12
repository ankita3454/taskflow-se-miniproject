# B Nuthan — Projects, Membership and Collaboration

**Feature ownership:** F4 projects and team membership; F5 assignment, comments and activity log. Database design is a secondary responsibility.

## Contribution

The documented project workflow includes project creation, invitations, membership, ownership transfer and archiving. Only the canonical project Owner manages membership and archives a project. Ownership transfer demotes the previous project Owner without changing system roles. Removing a member revokes access but retains historical task attribution; archived data remains viewable while new tasks are blocked.

Project members can add comments and view chronological comments and activity. Mentions use member email addresses, resolve active members and suppress self-notifications and duplicates. There is no independent comment or activity edit/delete API in the documented design; deletion of the parent task cascades its task-level records as specified by F2-REQ-08. This exception needs to be read alongside the stricter F5-REQ-07 wording.

## Evidence

`backend/src/sprint2/collaboration.js` and routes, invitation services, Prisma migrations and collaboration tests describe these behaviors. `sprint2-collaboration.test.js` includes malformed project-ID checks, mention/history, access revocation and ownership-transfer cases. The supplied original report states that the corrected ID checks passed; raw execution logs are not included. A complete end-to-end record of every original case is not available.
