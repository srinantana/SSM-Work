-- SSM Work · Punch List (trial, 13 Nov 2026)
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run).
-- Only the hub middleware (service key) reads and writes these tables and the photo bucket: RLS is on and there are
-- no policies, so the publishable/anon key cannot see them. Safe to run again.

-- one punch list per project (Job no. from RAK_Master_Project_on_hand)
create table if not exists public.punch_list_projects (
  id          text primary key,                       -- 'pl-' + Job no. (letters/digits only), e.g. pl-02702026
  job_no      text not null default '',
  customer    text not null default '',               -- Customer_name_short (RAK_Master_Customer_List)
  name        text not null default '',
  site        text not null default '',
  status      text not null default 'active' check (status in ('active', 'closed')),
  note        text not null default '',
  created_by  text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists punch_list_projects_job_idx on public.punch_list_projects (job_no) where job_no <> '';

-- items, added line by line
create table if not exists public.punch_list_items (
  id             bigint generated always as identity primary key,
  project_id     text not null references public.punch_list_projects (id) on delete cascade,
  no             int  not null default 1,              -- Item no. shown to the customer
  details        text not null default '',
  process        text not null default '' check (process in ('', 'design', 'purchase', 'fab', 'assembly', 'install', 'commission', 'customer', 'other')),
  discipline     text not null default '',             -- Mechanical / Piping PP / PVDF / Electrical / Control / Program / ...
  severity       text not null default '' check (severity in ('', 'A', 'B', 'C')),  -- A before SAT / safety · B before handover · C minor
  assignee       text not null default '',             -- person or team (e.g. Quality Assurance RAK)
  due_date       date,
  status         text not null default 'open' check (status in ('open', 'wip', 'check', 'done')),
  finished_date  date,
  note           text not null default '',             -- shown in the customer report
  ncr            boolean not null default false,       -- needs an NCR (internal)
  ncr_no         text not null default '',
  cause          text not null default '',             -- root cause (internal, not in the customer report)
  photos_before  jsonb not null default '[]'::jsonb,   -- [{p: '<project id>/<file>.jpg', at, by}]
  photos_after   jsonb not null default '[]'::jsonb,
  created_by     text,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists punch_list_items_project_idx on public.punch_list_items (project_id, no);
create index if not exists punch_list_items_ncr_idx on public.punch_list_items (process) where ncr;

alter table public.punch_list_projects enable row level security;
alter table public.punch_list_items enable row level security;

-- private bucket for before / after photos (JPEG, max 5 MB each — the app shrinks photos to ~1600 px before upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('punch-photos', 'punch-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
