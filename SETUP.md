# TaskFlow — Setup Guide

## Current foundation

- React frontend with a backend-connection check.
- Express backend with `/api/v1/health`.
- PostgreSQL 16.
- Prisma 6 migrations for User, Project, ProjectMember and Task.
- Database connectivity verification script.
- Docker Compose configuration for the frontend, backend and database.
- GitHub Actions for frontend lint/build and backend syntax/database checks.
- Jenkins pipeline skeleton, not yet executed in Jenkins.

Product features such as authentication and task management are tracked
in their separate assigned issues. This guide does not confirm their completion.

## Prerequisites

- Git.
- Docker Desktop with the engine running.
- Node.js and npm if using local development mode.

The foundation was verified locally using Node.js 24.7.0.
The application Docker images also use Node.js 24.7.0.

The submitted SRS specifies Node.js 20. Runtime alignment and
compatibility verification remain pending.

## Choose a run mode

- **Full Docker mode:** run the frontend, backend and database in containers.
- **Local development mode:** run PostgreSQL in Docker and use npm to run
  the frontend and backend locally.

Do not run both application modes simultaneously on the same ports.

## Environment files and credentials

Never commit actual `.env` files or credentials.

Each teammate uses a separate local database and chooses their own
local PostgreSQL password. Share migrations, not passwords or database volumes.

For the current connection-string configuration, use a long random
letters-and-numbers password. Special characters require URL encoding
in database URLs.

The PostgreSQL credentials initialise a new database volume.
Editing `.env` later does not change an existing database password.

For an existing checkout, do not overwrite `.env` files containing
your local settings.

## Option A — Full Docker mode

### 1. Configure the environment

From the repository root, for a new checkout:

```powershell
Copy-Item .env.example .env
```

Edit the root `.env` and replace the password placeholder with your
chosen local password.

The Compose configuration reads these root environment values.
Backend and frontend `.env` files are not required for full Docker mode.

### 2. Start the application

Stop any locally running frontend/backend development servers first.

From the repository root:

```powershell
docker compose up -d --build
docker compose ps
```

Compose starts PostgreSQL, waits for it to become healthy, and starts
the backend and frontend. The backend applies committed migrations
before starting its server.

### 3. Verify

Open http://localhost:5173 and click "Check backend connection".

Expected message:

```text
Connected: TaskFlow API
```

Health endpoint through the frontend:

```text
http://localhost:5173/api/v1/health
```

Expected response:

```json
{"status":"ok","service":"TaskFlow API"}
```

Check database connectivity:

```powershell
docker compose exec backend npm run db:check
```

Zero records are expected in a fresh database.

### 4. Rebuild after code changes

```powershell
docker compose up -d --build
```

The full Docker configuration does not provide live code reloading.

### 5. Stop services

```powershell
docker compose stop
```

This preserves database data.

## Option B — Local development mode

### 1. Configure environment files

From the repository root, for a new checkout:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Choose your PostgreSQL password in the root `.env`.

In `backend/.env`, use the same password, database name and username
as the root `.env`. With the example username and database name:

```text
DATABASE_URL="postgresql://taskflow:YOUR_LOCAL_PASSWORD@localhost:55432/taskflow_dev?schema=public"
```

The frontend example uses:

```text
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Only public configuration belongs in frontend environment variables.
Never put database passwords or other secrets in `VITE_` variables.

### 2. Start PostgreSQL

If you previously used full Docker mode, stop its application services:

```powershell
docker compose stop frontend backend
```

Start the database:

```powershell
docker compose up -d db
docker compose ps
```

Wait until PostgreSQL is healthy.

### 3. Install and prepare the backend

From the repository root:

```powershell
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:check
```

The database check should succeed. Zero records are expected in a
fresh database.

### 4. Start the backend

From `backend`:

```powershell
npm run dev
```

Health endpoint:

```text
http://localhost:5000/api/v1/health
```

### 5. Start the frontend

Open another terminal at the repository root:

```powershell
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173 and click "Check backend connection".

### 6. Run the available checks

From `frontend`:

```powershell
npm run lint
npm run build
```

From `backend`:

```powershell
npm run db:check
```

The backend `npm test` script is currently a failing placeholder.
An automated feature test suite has not yet been configured.

### 7. Stop local services

Press Ctrl+C in the frontend and backend terminals.

From the repository root:

```powershell
docker compose stop db
```

This preserves database data.

## Database addresses

- From the host computer: `localhost:55432`.
- From the backend container: `db:5432`.

The named Compose volume `postgres_data` stores database data.

Do not run `docker compose down -v` unless intentionally deleting
local database data.

## Database changes

Apply committed migrations using:

```powershell
npx prisma migrate deploy
```

Run Prisma commands from `backend` when developing locally.

Coordinate schema changes with Nuthan. Developers creating an agreed
schema change use:

```powershell
npx prisma migrate dev --name describe_the_change
```

Commit the resulting migration and updated schema.

Do not modify already-applied migration files.
Do not reset or delete data to resolve an error without review.

## GitHub Actions

The workflow runs on pushes and pull requests. It checks:

- Frontend lint and production build.
- Backend JavaScript syntax.
- Prisma schema validation and client generation.
- Migration application and database connectivity using a temporary
  PostgreSQL database.

These are foundation checks, not complete product-feature tests.
The workflow does not currently build Docker images or execute Jenkins.

## Jenkins pipeline skeleton

The root `Jenkinsfile` defines:

- Repository checkout.
- Tool availability checks.
- Frontend lint and build.
- Backend syntax and Prisma checks.
- Frontend and backend Docker image builds.

It requires a Linux Jenkins agent with Git, compatible Node.js/npm,
and access to Docker.

The Jenkins pipeline has not yet been executed on a Jenkins server.
Its dummy database URL is used for Prisma generation, not database testing.

## Remaining work and verification

- Verify a fresh clone on another teammate's computer.
- Align and verify the project runtime against the submitted SRS.
- Connect and execute the Jenkins pipeline on a configured Jenkins agent.
- Implement automated feature tests, coverage, SonarQube integration
  and test-environment deployment as required by the project plan.

The initial setup issue remains In Progress until its agreed
acceptance criteria are satisfied.