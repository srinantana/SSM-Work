-- SSM Work · Service Plan sheet snapshot (pushed by n8n, read by the Service Plan calendar)
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run).
-- One row (id = 'main') holds columns A–Q of tab "ใบขอคน 2026". Only the hub middleware (service key) reads
-- and writes it: RLS is on and there are no policies, so the publishable/anon key cannot see it.

create table if not exists public.service_plan_snapshot (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.service_plan_snapshot enable row level security;
