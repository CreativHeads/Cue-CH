-- Personal Telegram task cards: one message per task on its day, with next-step buttons
alter table app_settings add column task_cards_enabled boolean not null default true;
