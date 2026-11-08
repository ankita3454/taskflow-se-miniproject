# Ankita integration: accounts, audit and security (#26, #27, #28)

Services: `src/sprint2/security.js`, authenticated `/api/v1/admin` routes.
Admin users can list public account fields, change system roles, deactivate and
reactivate. Deactivation increments sessionVersion; reactivation needs fresh login.
Own demotion/deactivation is blocked. Project ownership is separate.
The UI is Administration, visible only for system Admins; server permissions also
apply to direct requests. Deactivation requires confirmation.

Audit GET filters `event`, `from`, `to` (UTC inclusive days), newest first, up to
1,000 entries. There is no audit mutation API. Failed-login actor is null. No
passwords, hashes, credentials or submitted email values enter the audit record.
Login limit: 10 failed or in-flight attempts per IP and normalized email in 15 minutes,
with 429 and Retry-After. Successful login reservations are released. Malformed JSON
uses a separate IP-scoped invalid-input bucket. The core test runner raises its own limit.
Express trust proxy stays disabled: forwarded IP headers are not trusted. This is a bounded,
single-process limiter, not a distributed or global per-account brute-force defense.

If no active Admin exists, the database operator can deliberately bootstrap the
FIRST Admin: register the intended account, then in backend PowerShell set
`$env:ALLOW_ADMIN_BOOTSTRAP='yes'`, run
`node scripts/grant-first-admin.js <registered-account-email>`, then
`Remove-Item Env:ALLOW_ADMIN_BOOTSTRAP`. Requires DB access; not an HTTP endpoint.
It refuses when an active Admin exists. Never commit credentials or .env.

Evidence: security API/service tests, limiter clock/capacity tests, Admin UI tests.
The lockfile updates body-parser and applies a targeted override for the Prisma config
deepmerge-ts advisory. See OPEN-RISKS.md for audit scope, remaining development-tool
findings and the compatibility risk of overriding a pinned major dependency.

## Security review map (not a penetration-test certification)

| Control | Code/tests reviewed |
|---|---|
| SEC-01 | Existing bcrypt registration/login/profile tests and plaintext-log regression retained |
| SEC-02 | Canonical project Owner checks, membership, assignee status rights; Admin does not imply project ownership |
| SEC-03 | Existing 200-title/2,000-description boundaries; new object-field allowlists, UUID/date/enum validation; comment text is not rendered as HTML |
| SEC-04 | Existing requireAuth re-reads account/role; new routers mount it before handlers; missing/tampered/expired and outsider cases covered |
| SEC-05 | Public account selection excludes passwordHash/sessionVersion; audit has no submitted credentials |
| SEC-06 | Failed login, role and account-status events are persisted; audit route read-only and Admin-only |
| SEC-07 | Login limiter also handles malformed JSON in the parser error path; threshold/recovery/Retry-After tests |

Review deployment proxy/rate-store assumptions and the dependency findings separately.
No broad claim of zero vulnerabilities, complete penetration testing or certification.
