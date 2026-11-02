# Ashritha integration: task organisation (#8, #9, #11, #12, #13)

Use the new Task browser sidebar screen; the existing Tasks creation screen stays.
All new routes are under `/api/v1` and require existing JWT/project permissions.

- GET `/projects/:id/task-query`: q title/description; status, priority, assignee
  (`unassigned` supported), tag, from/to due-date filters; sort createdAt/dueDate/
  priority, direction asc/desc. Null due dates sort last. Combined filters intersect.
- GET/POST `/projects/:id/tags`; PUT/DELETE `/tasks/:id/tags/:tagId`.
- POST `/tasks/:id/dependencies` with blockerId. Same-project, no self/cycles;
  project row locks serialize graph mutation, status, deletion and existing writes.
- DELETE `/tasks/:id`: canonical Owner only, confirmed in UI. Comments/activity/
  task-tag links cascade; shared tags and a separate security audit survive.

List/Kanban use the same sorted/filtered tasks. Filters/view are stored in
sessionStorage per user. No drag/drop requirement was invented. Details include
blockers, tags, status transitions and Owner editing/deletion. Existing status and
assignee/Owner permissions still apply; blocked Done returns 409 without a write.
Dependencies offered in the selector are the visible task set: clear filters if
needed to choose another task. Creating tasks remains in Tasks.

API tests cover cycles/concurrency, blockers, cross-project denial, tags, combined
queries, every sort direction and cascade cleanup. UI tests cover view/filter
persistence, cancelled deletion and rejected completion. An old rollback test now
injects an actual activity-store constraint failure with an authorised user instead
of trying to write as an unknown actor; rollback assertions were retained.
#29 load verification is a separate package 06, after all feature packages.
