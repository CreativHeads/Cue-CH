-- CH Content Tracker · initial schema (developer brief §3), plain PostgreSQL 13+.
-- All timestamps are timestamptz (UTC); "day" logic uses Asia/Kolkata.
-- Permissions are enforced in the app's API; triggers record who changed what.

-- ---------- enums ----------
create type content_type as enum ('story','carousel','reel','poster','video','other','creative_reel','presentation_video','special_days_poster');
create type task_stage   as enum ('to_brief','designing','client_review','approved','scheduled','posted');
create type staff_role   as enum ('admin','lead','designer','editor','viewer');
create type match_method as enum ('auto','suggested','manual');
create type post_status  as enum ('matched','extra','pending_review','ignored');
create type plan_status  as enum ('draft','active','closed');

-- ---------- shared trigger: updated_at ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- staff ----------
create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role staff_role not null,
  title text,
  telegram_chat_id bigint,
  digest_time time not null default '09:00',
  is_active boolean not null default true,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_email_lower on staff (lower(email));

-- ---------- clients ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ig_username text not null,
  windsor_account_id text,
  is_connected boolean not null default false,
  account_manager_id uuid references staff(id),
  inactivity_days int not null default 3,
  count_collabs boolean not null default true,
  brand_color text,
  logo_path text,
  platform text not null default 'instagram',
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- plans ----------
create table plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status plan_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  content_type content_type not null,
  monthly_count int not null default 0 check (monthly_count >= 0),
  frequency jsonb not null default '{"mode":"spread"}',
  owner_id uuid references staff(id),
  posting_time time not null default '19:00',
  label text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- instagram posts (filled from Phase 2) ----------
create table ig_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ig_media_id text not null unique,
  media_type text,
  product_type text,
  content_type content_type,
  permalink text,
  shortcode text,
  thumbnail_url text,
  posted_at timestamptz not null,
  caption text,
  reach int, likes int, comments int, saves int, views int,
  relationship text, owner_username text, collaborators text,
  status post_status not null default 'pending_review',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deleted_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- tasks ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_item_id uuid references plan_items(id) on delete set null,
  seq int,
  content_type content_type not null,
  due_at timestamptz not null,
  owner_id uuid references staff(id),
  stage task_stage not null default 'to_brief',
  title text not null,
  brief text,
  priority text not null default 'normal' check (priority in ('normal','high')),
  carried_over_from date,
  posted_at timestamptz,
  post_id uuid references ig_posts(id) on delete set null,
  permalink text,
  delivery text check (delivery in ('on_time','late','manual_unverified')),
  flags text[] not null default '{}',
  approved_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_item_id, seq)
);

create table task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references staff(id),
  type text not null check (type in ('stage_change','match','unmatch','reassign','manual_post','note','edit')),
  from_value text,
  to_value text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table post_matches (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  post_id uuid not null references ig_posts(id) on delete cascade,
  method match_method not null,
  score int,
  matched_by uuid references staff(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index post_matches_task_active on post_matches (task_id) where revoked_at is null;
create unique index post_matches_post_active on post_matches (post_id) where revoked_at is null;

-- ---------- jobs, notifications, reports, scores ----------
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('ok','partial','failed')),
  stats jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  kind text not null,
  task_id uuid references tasks(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  dedupe_key text unique,
  telegram_message_id bigint,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,
  data jsonb,
  summary_text text,
  pdf_path text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create table monthly_scores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month date not null,
  planned int not null default 0,
  on_time int not null default 0,
  late int not null default 0,
  missed int not null default 0,
  extra int not null default 0,
  score numeric(5,1),
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);

-- ---------- indexes ----------
create index tasks_client_due on tasks (client_id, due_at);
create index tasks_owner_stage on tasks (owner_id, stage);
create index ig_posts_client_posted on ig_posts (client_id, posted_at);
create index ig_posts_status on ig_posts (status);
create index task_events_task on task_events (task_id, at);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['staff','clients','plans','plan_items','ig_posts','tasks','post_matches','sync_runs','notifications','weekly_reports','monthly_scores'] loop
    execute format('create trigger %I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- sign-in sessions ----------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_staff on sessions (staff_id);

-- ---------- task triggers ----------
-- The API sets app.actor_id inside each write transaction so the audit trail knows who acted.
create or replace function current_actor() returns uuid language sql stable as $$
  select nullif(current_setting('app.actor_id', true), '')::uuid
$$;

create or replace function tasks_stage_times() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    if new.stage = 'approved' and new.approved_at is null then new.approved_at = now(); end if;
    if new.stage = 'scheduled' and new.scheduled_at is null then new.scheduled_at = now(); end if;
  end if;
  return new;
end $$;
create trigger tasks_stage_times before update on tasks for each row execute function tasks_stage_times();

create or replace function tasks_audit() returns trigger language plpgsql as $$
declare actor uuid := current_actor();
begin
  if tg_op = 'INSERT' then
    insert into task_events (task_id, actor_id, type, from_value, to_value)
    values (new.id, actor, 'stage_change', null, new.stage::text);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into task_events (task_id, actor_id, type, from_value, to_value)
    values (new.id, actor,
            case when new.stage = 'posted' and new.delivery = 'manual_unverified' then 'manual_post' else 'stage_change' end,
            old.stage::text, new.stage::text);
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into task_events (task_id, actor_id, type, from_value, to_value)
    values (new.id, actor, 'reassign', old.owner_id::text, new.owner_id::text);
  end if;
  if new.due_at is distinct from old.due_at then
    insert into task_events (task_id, actor_id, type, from_value, to_value)
    values (new.id, actor, 'edit', old.due_at::text, new.due_at::text);
  end if;
  return new;
end $$;
create trigger tasks_audit after insert or update on tasks for each row execute function tasks_audit();
