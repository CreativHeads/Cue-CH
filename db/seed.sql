-- Seed: staff and the six initial clients. Safe to re-run.
-- Replace the placeholder emails with each person's real email before running.
-- Nobody has a password yet: set the admin's with `npm run set-password -- <email> '<password>'`,
-- then the admin sets everyone else's from the Team screen.

insert into staff (name, email, role, title) values
  ('Souban',   'souban@example.com',   'admin',    'Admin'),
  ('Thanseeh', 'thanseeh@example.com', 'lead',     'Creative lead'),
  ('Basil',    'basil@example.com',    'designer', 'Visual designer'),
  ('Raheesha', 'raheesha@example.com', 'designer', 'Visual designer'),
  ('Shelby',   'shelby@example.com',   'editor',   'Video editor'),
  ('Sabiq',    'sabiq@example.com',    'editor',   'Motion designer')
on conflict (email) do nothing;

insert into clients (name, ig_username, is_connected, brand_color, account_manager_id)
select v.name, v.ig, true, v.color, (select id from staff where role = 'lead' limit 1)
from (values
  ('Elite Dental Studio', 'elitedentalstudio', '#e4efe7'),
  ('Staxhaus',            'staxhaus',          '#f3e9da'),
  ('Malabar',             'malabar',           '#f5e6e2'),
  ('Union',               'union',             '#e6e8f4'),
  ('Haircom',             'haircom.in',        '#f6ebdd'),
  ('Dentcom',             'dentcom',           '#e2eef0')
) as v(name, ig, color)
where not exists (select 1 from clients c where c.ig_username = v.ig);
