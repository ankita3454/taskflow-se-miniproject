# Ashritha Kamalakar Hegde — Task Lifecycle and Organisation

**Feature ownership:** F2 task lifecycle; F3 tagging, search and filtering.

## Contribution

The backend supports task creation, edits, status changes and deletion, with priority, due dates and estimates. The documented workflow follows To Do → In Progress → In Review → Done with specified returns; an incomplete blocker prevents Done. Dependencies are restricted to one project and cycles are rejected. Project-level locking is used for graph mutations and related operations.

Tasks can be searched by title/description and filtered by status, priority, assignee, tag and due-date range; supported sorts include created date, due date and priority. Tags are project-specific. The supplied original documentation describes shared list/Kanban filters and saved view state, but frontend source was not supplied.

A canonical project Owner can delete a task. Under F2-REQ-08 its comments, activity and tag links are removed, while shared tags and a separate security audit survive. This creates a conflict with the absolute wording of F5-REQ-07; the deletion exception is an implementation decision rather than a formal SRS amendment.

## Evidence

The backend archive includes `src/sprint2/tasks.js`, task routes, `taskService.js`, `tests/sprint2-tasks.test.js`, `task-status.test.js` and task creation/editing tests. The saved Windows load artifacts document measured search/filter performance; results and limits are in `LOAD-VERIFICATION.md`. The original reports describe passing tests, but the complete raw runner logs and frontend test files were not included.
