-- Site Expense projects — one row per project, full project JSON in `data` (Dew, 14 Nov 2026).
-- Written only by the SSM Work server (service role) through /api/site-expense/projects, which checks Site Expense rights.
-- Safe to run more than once.
begin;
create table if not exists site_expense_projects (
  id          text primary key,
  ij          text not null,
  jo          text not null default '',
  status      text not null default 'draft',
  list        text not null default 'active',
  data        jsonb not null,
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists site_expense_projects_ij on site_expense_projects (lower(ij));
create index if not exists site_expense_projects_updated on site_expense_projects (updated_at desc);
alter table site_expense_projects enable row level security; -- no policies: browsers cannot read or write it directly
commit;
