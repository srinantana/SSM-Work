-- Site Expense: daily allowance (เบี้ยเลี้ยง) by country type — Dew, 14 Nov 2026.
-- Adds one table only; the other se_rate_* tables are not touched. Safe to run more than once (updates the rates).
begin;
create table if not exists se_rate_allowance (allowance_type text primary key, rate_per_day numeric not null, sort int not null default 0, updated_at timestamptz default now());
insert into se_rate_allowance (allowance_type, rate_per_day, sort) values
  ('Local (Thailand)', 150, 0),
  ('Developed Country', 1200, 1),
  ('Developing Country', 800, 2)
on conflict (allowance_type) do update set rate_per_day = excluded.rate_per_day, sort = excluded.sort, updated_at = now();
alter table se_rate_allowance enable row level security; -- read by the SSM Work server only (service role)
commit;
