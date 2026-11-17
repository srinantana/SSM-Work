-- SSM Work · Site Team (ทีมหน้างาน) — team list with passport, ID card and date of birth, passport renewals and
-- overseas trips (who goes, passport check, travel insurance list).
-- Run once in the Supabase project used by ssmwork.vercel.app: Dashboard → SQL Editor → New query → Run.
-- Personal data (national ID, passport no., date of birth) lives only here — never in git. Only the hub middleware
-- (service key) reads and writes these tables: RLS is on and there are no policies. The middleware shows the full
-- numbers only to SC / PC / SSM (same list as Manpower editors); everyone else sees name, team and expiry dates.

create table if not exists public.site_team_people (
  id               bigint generated always as identity primary key,
  worker_id        text,                 -- mp_workers.id (Manpower) when the person is on the board
  emp_code         text,
  name_en          text,                 -- as printed in the passport, e.g. "SAKSRI UNSRI"
  name_th          text,
  sex              text,                 -- M / F
  nationality      text default 'THA',
  national_id      text,
  birth_date       date,
  passport_no      text,
  passport_issue   date,
  passport_expiry  date,
  passport_file    text,                 -- link to the scan in Google Drive
  visa_note        text,
  renewal_status   text default '',      -- '' | needed | in_progress | done
  renewal_cost     numeric(12,2),
  renewal_note     text,
  insurance_type   text default '',      -- '' | trip | annual
  insurance_policy text,
  insurance_expiry date,
  note             text,
  active           boolean not null default true,
  updated_by       text,
  updated_at       timestamptz not null default now()
);
create unique index if not exists site_team_people_worker on public.site_team_people (worker_id) where worker_id is not null;

create table if not exists public.site_team_trips (
  id              bigint generated always as identity primary key,
  title           text not null,         -- project / job name
  job_no          text,
  customer        text,
  country         text,
  date_from       date,
  date_to         date,
  insurance_type  text default 'trip',   -- trip | annual
  note            text,
  people          jsonb not null default '[]'::jsonb,   -- [site_team_people.id, ...]
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.site_team_people enable row level security;
alter table public.site_team_trips  enable row level security;
