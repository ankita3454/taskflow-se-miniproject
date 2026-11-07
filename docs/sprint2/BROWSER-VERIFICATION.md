# Dashboard rendering and integrated browser smoke (#30, #32)

Use a disposable DB, backend dependencies installed and migrations applied.
Package 08 adds Playwright as frontend dev dependency. From frontend:
`npm ci`, `npx playwright install chromium`, `npm run build`, then in one terminal
`npm run preview -- --host 0.0.0.0 --port 5177 --strictPort`.
Ensure no other backend is listening on 5000. In a second terminal, from backend
with DATABASE_URL/JWT_SECRET for the disposable DB:

```powershell
$env:ALLOW_PERFORMANCE_FIXTURES='yes'
node scripts/sprint2/browser.js
node scripts/sprint2/smoke.js
Remove-Item Env:ALLOW_PERFORMANCE_FIXTURES
```

Scripts start their own API on 5000 (failure to bind aborts), seed only their own
fixtures and remove them in finally. No tokens/credentials enter result JSON.
Production frontend defaults to localhost:5000; this procedure uses that same
base URL. Do not point it at an existing live backend. BROWSER_FRONTEND_URL may
change the preview URL; rebuild frontend if your API base differs. CHROMIUM_PATH
is optional for an already installed Chromium executable, not required on Windows
with Playwright's downloaded browser.

Browser timing includes navigation, token restore, project/data retrieval, rendered
metrics/workload, correctly valued 125/500 (25%), SVG burndown and two animation
frames. Five fresh browser contexts (cold cache), 500 tasks/20 members, no CPU/network
throttle, no concurrent load. Each run <=2 seconds and zero browser/API errors is
required. `evidence/browser.json` records individual real Linux results and method.
Not merely the dashboard route responding or a loading placeholder being visible.

Smoke checks use the real backend/browser to create a project and its first task,
post literal comment text, switch to Kanban, open Project settings/Today/Admin.
`evidence/smoke.json` records actual results. The authenticated test account is
bootstrapped by test fixtures; this does not claim a full registration walkthrough.
Stop the Vite preview after verification. Generated performance-results/ is ignored;
copy only reviewed, sanitized evidence into docs, never raw credentials or tokens.
