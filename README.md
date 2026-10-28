# CH Content Tracker

Plans each client's monthly Instagram package, turns it into dated tasks, and tracks them through
production: To brief → Designing → Client review → Approved → Scheduled → Posted.

This is **Phase 1** of the developer brief: sign-in, staff, clients, plans and plan items, frequency
rules, task generation, the kanban board, task drawer, My tasks, the dashboard grid (manual
statuses) and the manual "Mark posted" button. Review queue, Reports and Settings show what
arrives in Phases 2–4; their database tables already exist.

Stack: Next.js 15 (App Router) · PostgreSQL (on your own server) · Zod · Vitest.
Everything runs on one server, alongside any other sites already there. No outside services.
All times are stored in UTC and shown in IST (Asia/Kolkata).

## 1. Create the database

On the server (or locally), with PostgreSQL 13 or newer installed:

```bash
sudo -u postgres psql -c "create user ch_tracker with password 'CHOOSE_A_STRONG_PASSWORD';"
sudo -u postgres psql -c "create database ch_tracker owner ch_tracker;"
```

This is a separate database and user, so it never touches the databases your other sites use.

## 2. Configure

```bash
cp .env.example .env.local
```

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgres://ch_tracker:PASSWORD@127.0.0.1:5432/ch_tracker` |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `INSECURE_COOKIES` | `false`. Set `true` only while testing over plain http without HTTPS. |

The Windsor, Telegram, cron and OpenAI variables are for later phases.

## 3. Install, create tables, add people

```bash
npm install
```

Open `db/seed.sql` and **replace the placeholder emails with the team's real emails**. Then:

```bash
npm run db:seed
```

That creates the tables and adds the staff and six clients. Both scripts are safe to re-run:
`npm run db:migrate` alone applies any new migrations.

Give the admin a password:

```bash
npm run set-password -- souban@yourdomain.com 'a-strong-password'
```

Souban then signs in and sets everyone else's starting password from **Team** (*Add teammate* or
*Reset password*). Anyone can change their own password from the gear icon next to their name.

## 4. Run

```bash
npm run dev        # development, http://localhost:3000
npm run build && npm start   # production
npm test           # unit + database integration tests (in-memory PostgreSQL, no setup needed)
npm run typecheck
```

## Checking it on this PC

A real PostgreSQL 17 is installed in `node_modules` (via `embedded-postgres`), with its data in
`../pgdata` on port 5433, and `.env.local` already points at it. The local test logins are in
`.env.local` as comments.

```bash
npm run db:local -- start     # start the local database (status / stop also work)
npm run dev                   # open http://localhost:3000
```

Other checks:

```bash
npm test                      # 31 unit + PostgreSQL tests (in memory, nothing to set up)
npm run smoke                 # 53 end-to-end checks over HTTP against the running app;
                              # needs BASE_URL, ADMIN_EMAIL/PASSWORD, DESIGNER_EMAIL/PASSWORD;
                              # cleans up after itself
DEMO_DATA=yes npm run db:demo # fill an empty LOCAL database with a realistic sample month
```

## First use

1. Sign in as the admin.
2. **Monthly plans** → pick a client and month → *Start a blank plan* (or copy last month).
3. Add content lines: type, count, rhythm (weekdays / per week / spread / fixed dates), owner,
   posting time. The calendar previews the dates live.
4. **Activate plan** creates the month's tasks. *Regenerate tasks* is safe to re-run: it only moves
   or removes untouched future tasks and never duplicates.

## Roles (checked by the server on every request)

| Role | Can do |
| --- | --- |
| Admin | Everything: clients, staff and passwords, plans, tasks. |
| Lead | Plans, task assignment and editing all tasks. |
| Designer / Editor | See everything; update only their own tasks (stage, brief, priority, notes, mark posted). Cannot change owner, client, type, due date or flags. |

Every stage change, reassignment and due-date change is written to `task_events` by a database
trigger, with the person who made it.

## Security notes

- Passwords are hashed with scrypt; sessions are random tokens kept in an http-only cookie, and
  only a SHA-256 of the token is stored. Sessions last 30 days.
- Resetting a password or deactivating someone signs them out everywhere.
- Repeated wrong passwords are slowed down (8 tries per 15 minutes per email and IP).
- Keep `.env.local` out of git; it holds the database password.

## Project layout

```
db/migrations/0001_init.sql   full schema (all phases), sessions, audit triggers
db/seed.sql                   staff + six initial clients
scripts/                      migrate / seed / set-password
src/lib/generation.ts         §4 frequency rules and idempotent generation
src/lib/plans.ts, tasks.ts    plan and task services (permissions live here)
src/lib/score.ts              §10 delivery score and grid dots
src/lib/auth.ts, db.ts        passwords, sessions, PostgreSQL connection
src/app/api/**                §11 REST endpoints (Zod-validated)
src/app/(app)/**              screens
tests/                        unit tests + PostgreSQL integration tests
```

## Deploying to a VPS (later)

Not set up yet. The plan: run it with PM2 on a free port (e.g. 3001), add an nginx site for its
own subdomain next to the existing sites, and add a free HTTPS certificate with certbot.
