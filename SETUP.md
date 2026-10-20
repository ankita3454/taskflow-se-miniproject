# TaskFlow — Local Development Setup

## Current implementation

- React frontend with a backend-connection check.
- Express backend with `/api/v1/health`.
- PostgreSQL 16 running through Docker Compose.
- Prisma 6 migrations for User, Project, ProjectMember and Task.
- Database connectivity verification script.

Authentication, task features and other product functionality
are implemented through their separate assigned issues.

## Prerequisites

- Git
- Node.js and npm
- Docker Desktop with the engine running

The current scaffold was verified locally using Node.js 24.7.0.
The submitted SRS specifies Node.js 20; runtime alignment and
compatibility verification remain pending.

## 1. Configure local environment files

Run from the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

For an existing checkout, do not overwrite environment files
that already contain your local settings.

In the root `.env`, choose your own local PostgreSQL password.

In `backend/.env`, use the same local password in DATABASE_URL:

postgresql://taskflow:YOUR_LOCAL_PASSWORD@localhost:55432/taskflow_dev?schema=public

Use a long random letters-and-numbers password for this setup.
Special characters in connection-string passwords require URL encoding.

Never commit actual `.env` files or credentials.

Each teammate runs a separate local database. Share migrations,
not local passwords or database volumes.

## 2. Start PostgreSQL

From the repository root:

```powershell
docker compose up -d db
docker compose ps
```

Wait for the database to become healthy.

Host connection: localhost:55432.
Container PostgreSQL port: 5432.

The configured password initialises a new database volume.
Editing `.env` later does not change an existing database password.

## 3. Install and prepare the backend

```powershell
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:check
```

The database check should succeed. Zero records are expected
in a fresh database.

## 4. Start the backend

From `backend`:

```powershell
npm run dev
```

Health endpoint:
http://localhost:5000/api/v1/health

## 5. Start the frontend

Open another terminal at the repository root:

```powershell
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173 and click "Check backend connection".

Expected message: Connected: TaskFlow API

## Verification

From `frontend`:

```powershell
npm run lint
npm run build
```

From `backend`:

```powershell
npm run db:check
```

## Database changes

Apply committed migrations using `npx prisma migrate deploy`.

Coordinate schema changes with Nuthan. Developers creating an
agreed schema change use `npx prisma migrate dev --name <change_name>`
and commit the resulting migration.

Do not modify already-applied migration files.
Do not reset or delete shared data to resolve an error without review.

## Stopping local services

Use Ctrl+C in the frontend/backend terminals.

From the repository root:

```powershell
docker compose stop db
```

This preserves the database volume.

## Remaining setup work

- Verify a fresh clone on another teammate's computer.
- Align and verify the project runtime against the submitted SRS.
- Containerise the frontend/backend.
- Add GitHub Actions checks and the Jenkins pipeline skeleton.
- Complete the remaining agreed pipeline configuration.

## Run the full application with Docker

Prerequisites:
- Docker Desktop is running.
- Create the root `.env` from `.env.example` and configure your local PostgreSQL credentials.
- Stop locally running frontend/backend development servers to free ports 5173 and 5000.

From the repository root:

```powershell
docker compose up -d --build
docker compose ps
```

Open http://localhost:5173 and click “Check backend connection”.

Health endpoint through the frontend:
http://localhost:5173/api/v1/health

Check database connectivity:

```powershell
docker compose exec backend npm run db:check
```

Stop the services without deleting database data:

```powershell
docker compose stop
```

After changing application code, rebuild with:

```powershell
docker compose up -d --build
```

The database uses the named `postgres_data` volume.
Do not run `docker compose down -v` unless intentionally deleting local database data.

Current Docker Node runtime: 24.7.0.
Alignment with the submitted SRS Node 20 runtime remains pending.

## Jenkins pipeline skeleton

The root Jenkinsfile defines frontend lint/build, backend syntax and
Prisma checks, and Docker image builds.

It requires a Linux Jenkins agent with Git, compatible Node.js/npm,
and access to Docker.

The pipeline has not yet been executed on a Jenkins server.
Automated feature tests, coverage, SonarQube integration, and deployment
remain to be implemented. Node runtime alignment with the SRS is pending.