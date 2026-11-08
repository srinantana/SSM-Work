-- SSM Work · Spare Part projects
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run).
-- Only the hub middleware (service key) reads and writes this table: RLS is on and there are no policies,
-- so the publishable/anon key cannot see it.

create table if not exists public.spare_part_projects (
  id          text primary key,
  jo          text not null default '',
  customer    text not null default '',
  name        text not null default '',
  status      text not null default 'draft',
  data        jsonb not null,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists spare_part_projects_jo_idx on public.spare_part_projects (jo);
create index if not exists spare_part_projects_updated_idx on public.spare_part_projects (updated_at desc);

alter table public.spare_part_projects enable row level security;
