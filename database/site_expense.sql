-- SSM Work · Site Expense (DRAFT — menu not in use yet; do not run until the Estimate section is built)
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run).
-- Only the hub middleware (service key) reads and writes these tables: RLS is on and there are no policies,
-- so the publishable/anon key cannot see them.
--
-- Flow:  Estimate from SOW (estimate_lines) → approval SC → SSM → MD (approvals)
--        → Job opened, JO set → Transform to Budgetary (budget_lines, locked)
--        → site team records daily Actual (actuals) → Dashboard = view site_expense_budget_vs_actual

-- 1. Expense category groups (shared by Estimate, Budget and Actual so they compare line by line)
create table if not exists public.site_expense_categories (
  code     text primary key,
  name_en  text not null,
  name_th  text not null default '',
  sort     int  not null default 0,
  active   boolean not null default true
);
insert into public.site_expense_categories (code, name_en, name_th, sort) values
  ('manpower',       'Manpower',            'ค่าแรง / Manday',            1),
  ('subcontract',    'Subcontract',         'ผู้รับเหมาช่วง',               2),
  ('transportation', 'Transportation',      'ขนส่ง / รถ',                 3),
  ('accommodation',  'Accommodation',       'ที่พัก',                      4),
  ('travel',         'Travel & Air Ticket', 'เดินทาง / ตั๋วเครื่องบิน',       5),
  ('site_expense',   'Site Expense',        'ค่าใช้จ่ายหน้างาน',             6)
on conflict (code) do update set name_en = excluded.name_en, name_th = excluded.name_th, sort = excluded.sort;

-- 2. One row per Site Expense project (starts from an IJ, gets a JO when the Job is opened)
create table if not exists public.site_expense_projects (
  id           text primary key,
  ij_no        text not null default '',
  jo           text,                                   -- null until the Job is opened; required for Actual
  customer     text not null default '',
  name         text not null default '',
  site         text not null default '',
  start_date   date,
  end_date     date,
  status       text not null default 'draft'
               check (status in ('draft','submitted','ssm_reviewed','approved','rejected','budget_locked','closed')),
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists site_expense_projects_jo_idx on public.site_expense_projects (jo);
create index if not exists site_expense_projects_ij_idx on public.site_expense_projects (ij_no);

-- 3. Estimate lines from the Scope of Work
create table if not exists public.site_expense_estimate_lines (
  id          bigint generated always as identity primary key,
  project_id  text not null references public.site_expense_projects(id) on delete cascade,
  sort        int  not null default 0,
  category    text not null references public.site_expense_categories(code),
  scope       text not null default '',                 -- SOW item / description
  people      numeric,                                  -- persons
  days        numeric,
  qty         numeric,                                  -- manday or other quantity
  unit        text not null default '',
  unit_rate   numeric not null default 0,               -- from master rate at time of estimate
  amount      numeric not null default 0,
  remark      text not null default ''
);
create index if not exists site_expense_estimate_project_idx on public.site_expense_estimate_lines (project_id);

-- 4. Approval history (SC submit → SSM review → MD approve)
create table if not exists public.site_expense_approvals (
  id          bigint generated always as identity primary key,
  project_id  text not null references public.site_expense_projects(id) on delete cascade,
  step        text not null check (step in ('sc','ssm','md')),
  action      text not null check (action in ('submit','approve','reject','revise')),
  by_email    text not null,
  note        text not null default '',
  at          timestamptz not null default now()
);
create index if not exists site_expense_approvals_project_idx on public.site_expense_approvals (project_id, at);

-- 5. Budgetary: approved totals per category, written once when the Job is opened and then locked
create table if not exists public.site_expense_budget_lines (
  project_id  text not null references public.site_expense_projects(id) on delete cascade,
  category    text not null references public.site_expense_categories(code),
  amount      numeric not null default 0,
  locked_at   timestamptz not null default now(),
  locked_by   text,
  primary key (project_id, category)
);

-- 6. Actual expenses recorded daily by the site team
create table if not exists public.site_expense_actuals (
  id           bigint generated always as identity primary key,
  project_id   text not null references public.site_expense_projects(id) on delete cascade,
  spent_on     date not null,
  category     text not null references public.site_expense_categories(code),
  description  text not null default '',
  amount       numeric not null check (amount >= 0),
  receipt_url  text,
  recorded_by  text not null,
  status       text not null default 'pending' check (status in ('pending','checked','rejected')),
  checked_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists site_expense_actuals_project_idx on public.site_expense_actuals (project_id, spent_on);

-- 7. Dashboard: Budget vs Actual per project and category (rejected actuals excluded)
create or replace view public.site_expense_budget_vs_actual with (security_invoker = true) as
select p.id as project_id, p.jo, p.ij_no, p.customer, p.name, c.code as category, c.name_en, c.sort,
       coalesce(b.amount, 0) as budget,
       coalesce(a.actual, 0) as actual,
       coalesce(b.amount, 0) - coalesce(a.actual, 0) as remaining,
       case when coalesce(b.amount, 0) > 0 then round(coalesce(a.actual, 0) / b.amount * 100, 1) end as used_pct
from public.site_expense_projects p
cross join public.site_expense_categories c
left join public.site_expense_budget_lines b on b.project_id = p.id and b.category = c.code
left join (select project_id, category, sum(amount) as actual
           from public.site_expense_actuals where status <> 'rejected'
           group by project_id, category) a on a.project_id = p.id and a.category = c.code;

alter table public.site_expense_categories     enable row level security;
alter table public.site_expense_projects       enable row level security;
alter table public.site_expense_estimate_lines enable row level security;
alter table public.site_expense_approvals      enable row level security;
alter table public.site_expense_budget_lines   enable row level security;
alter table public.site_expense_actuals        enable row level security;
