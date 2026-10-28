# CH Content Tracker

Plans each client's monthly Instagram package, turns it into dated tasks, and tracks them through
production: To brief → Designing → Client review → Approved → Scheduled → Posted.

Built so far (developer brief): **Phase 1** (sign-in, staff, clients, plans, task generation, board,
drawer, My tasks, delivery grid, manual posted), **Phase 2** (Instagram data via Windsor.ai, matching,
review queue, extras, deletion detection, job health), **Phase 3** (Telegram digest, 2-hour nudge, overdue
alerts, inactivity flags, quiet hours, copy guard, linking and tap-to-approve buttons) and **Phase 5**
(story capture and matching, month-end scores). Phase 4 (weekly client report + PDF) is not built yet.

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

## Deploying to the VPS (cue.creativheads.com)

The VPS runs each project in Docker behind one shared Caddy (in casting-manager), which serves
HTTPS for every domain. Cue follows the same pattern as ad-reports:

- `deploy/vps/docker-compose.yml`: the app, its own PostgreSQL, a scheduler and daily backups
  (14 kept). The app joins the shared network as `cue-tracker`.
- `deploy/vps/deploy.sh`: uploads the **committed** code to `/opt/cue`, creates `deploy/vps/.env`
  with random secrets on the first run (never overwritten), builds and starts the containers, loads
  staff and clients once, and adds a `cue.creativheads.com` block to the shared Caddyfile (validated,
  reverted if invalid). The other projects are not touched.

```bash
CUE_VPS=root@<vps-ip> bash deploy/vps/deploy.sh
```

Before the first deploy: add a DNS **A record** `cue` → the VPS IP. After it:

1. Set the admin password (see the command the script prints), sign in, and correct the staff emails
   on **Team → Edit**.
2. Fill in `WINDSOR_API_KEY` and `TELEGRAM_BOT_TOKEN` in `/opt/cue/deploy/vps/.env`, then
   `docker compose up -d` in that folder.
3. Set each client's data account ID (Clients → Edit) so Instagram rows map to the right client.

### Scheduled jobs (IST)

| Job | When |
| --- | --- |
| Instagram posts (14-day lookback) + matching | every 3 hours |
| Instagram stories (today, yesterday) | every 2 hours at :45 |
| Nudges + overdue alerts | every 15 minutes |
| Morning digest | 09:00 |
| Inactivity flags | 10:00 |
| Weekly carry-over | Monday 00:15 |
| Month-end scores | 1st (provisional) and 8th (final), 05:30 |
| Next-month plan prompt | 25th, 10:00 |

Health: **Settings → Job health** shows each job's last run and flags anything that hasn't succeeded
in twice its interval.

### Telegram: send-only vs. own bot

A Telegram bot can have only one webhook. The VPS's `creativheads` app already runs several bots on
webhooks, so by default Cue only **sends** (no webhook): give it any bot token and enter each
person's chat ID on **Team → Telegram**. If Cue gets its **own** bot (new one from @BotFather), set
`TELEGRAM_WEBHOOK_ENABLED=true` and `TELEGRAM_BOT_USERNAME`, then register the webhook once:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://cue.creativheads.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

That turns on self-linking (Settings → Connect Telegram) and the tap-to-approve buttons.
