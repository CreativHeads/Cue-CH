-- Post the morning task list to a team Telegram group, instead of (or as well as) personal chats
alter table app_settings add column team_group_chat_id text;
alter table app_settings add column digest_target text not null default 'personal' check (digest_target in ('personal', 'group', 'both'));
