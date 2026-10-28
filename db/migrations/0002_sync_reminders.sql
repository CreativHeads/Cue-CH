-- Phases 2, 3 and 5: Instagram matching state, deletion detection, settings, Telegram linking.

-- ig_posts: matching state and deletion detection
alter table ig_posts add column suggested_task_id uuid references tasks(id) on delete set null;
alter table ig_posts add column match_score int;
alter table ig_posts add column manual boolean not null default false;        -- a person decided; automatic runs leave it alone
alter table ig_posts add column decided_by uuid references staff(id);
alter table ig_posts add column missed_syncs int not null default 0;           -- consecutive lookback runs that didn't return it
alter table ig_posts add column is_story boolean not null default false;
alter table ig_posts add column platform text not null default 'instagram';
create index ig_posts_open on ig_posts (client_id, posted_at) where status in ('pending_review', 'extra') and not manual;

-- tasks: story frames counted separately per plan line (brief §5.2)
alter table plan_items add column story_frames_count_separately boolean not null default false;

-- workspace settings (one row)
create table app_settings (
  id int primary key default 1 check (id = 1),
  digest_enabled boolean not null default true,
  nudge_enabled boolean not null default true,
  overdue_enabled boolean not null default true,
  inactivity_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  digest_time time not null default '09:00',
  banned_terms text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1);
create trigger app_settings_updated before update on app_settings for each row execute function set_updated_at();

-- one-time codes for linking Telegram via t.me/<bot>?start=<code>
create table telegram_link_codes (
  code text primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- notifications: keep the message text for the outbox view
alter table notifications add column text text;
alter table notifications add column held_until timestamptz;    -- quiet hours

-- sync_runs: one row per job run
create index sync_runs_job on sync_runs (job, started_at desc);
