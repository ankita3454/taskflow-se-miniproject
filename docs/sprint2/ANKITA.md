# Ankita Pramod — Accounts, Administration and Security

**Feature ownership:** F1 user accounts and authentication; F8 administration. This report describes the supplied implementation, not a new security certification.

## Contribution

- Account authentication uses passwords and JWTs; protected routes check the active account and applicable role.
- Admin routes list public account information, change system roles, deactivate/reactivate accounts and expose a filtered security audit. Admin rights do not override project ownership.
- Deactivation changes the session version so older sessions remain invalid after reactivation. Self-demotion and self-deactivation are blocked.
- Failed logins, role changes and account-status changes are security events. Failed-login actor is intentionally null because the caller is unauthenticated. Audit responses do not intentionally include passwords or hashes.
- The documented login limiter uses 10 failed or in-flight attempts per IP and normalized email in 15 minutes, returns 429 with Retry-After, and separately handles malformed JSON. It is a bounded in-process mechanism, not a distributed defense.

## Evidence and limitation

`backend/src/sprint2/security.js`, `security.routes.js`, authentication middleware and `backend/tests/sprint2-security.test.js` contain the relevant logic and tests. The source bundle includes a deliberate first-admin bootstrap script requiring database access; its environment and any credentials must remain private. The original reports describe passing security-related tests and dependency-audit findings; raw test and audit logs were not supplied. The manual review and complete SEC-01–07 validation required by the STP are not independently established. The security audit preserves destructive-action metadata but is not a complete substitute for deleted task activity.
