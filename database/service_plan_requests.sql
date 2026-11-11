-- SSM Work · Service Plan — ขอคน (manpower requests, trial 11 Nov 2026)
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run),
-- after database/manpower.sql and database/manpower-002.sql. Safe to run again.
-- Only the hub middleware (service key) reads and writes these tables: RLS is on and there are no policies.

create table if not exists public.sp_requests (
  id             bigserial primary key,
  type           text not null check (type in ('IS','SO','IN','WR','IJ','JO')),
  customer       text not null,
  job_name       text not null,
  job_no         text,
  description    text,
  vehicle        text,                          -- ทะเบียนรถ
  date_from      date not null,
  date_to        date not null,
  cancelled      boolean not null default false,
  requested_by   text not null,                 -- username of the signed-in requester
  requested_name text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists sp_requests_dates on public.sp_requests (date_from, date_to);

-- One row per requested person; this status is what Service Plan and Manpower both show.
create table if not exists public.sp_request_people (
  id            bigserial primary key,
  request_id    bigint not null references public.sp_requests(id) on delete cascade,
  worker_id     text not null references public.mp_workers(id) on update cascade,
  is_leader     boolean not null default false, -- SS หัวหน้าทีม
  mode          text not null default 'book' check (mode in ('book','swap')),
  reason        text,                           -- why a swap is asked
  conflicts     jsonb,                          -- what the person had on those days when the request was made
  status        text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled')),
  decided_by    text,
  decided_name  text,
  decided_at    timestamptz,
  decision_note text,
  unique (request_id, worker_id)
);
create index if not exists sp_request_people_status on public.sp_request_people (status);
create index if not exists sp_request_people_worker on public.sp_request_people (worker_id);

alter table public.sp_requests       enable row level security;
alter table public.sp_request_people enable row level security;

notify pgrst, 'reload schema';
