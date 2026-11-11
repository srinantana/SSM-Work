-- SSM Work · Manpower (วางแผนกำลังคน) — replaces the Google Sheet "26 (PD)- ตารางงานและวันหยุดช่าง 2569".
-- Run once in the Supabase project used by ssmwork.vercel.app (Dashboard → SQL Editor → New query → Run),
-- then run the generated seed file (scripts/manpower-import.py → manpower-seed.sql; not in git).
-- Only the hub middleware (service key) reads and writes these tables: RLS is on and there are no policies,
-- so the publishable/anon key cannot see them. Edit rights (SC / PC / SSM) are checked in hub/middleware.js.

create table if not exists public.mp_workers (
  id        text primary key,               -- RAK employee code (R31008…) or X### when the code is unknown
  emp_code  text,
  name_th   text not null,
  nickname  text,
  unit      text not null check (unit in ('ME','PP','EE','PC','SC')),
  trade     text,                           -- ที่ปรึกษา / หัวหน้าหน่วย / เตรียม / ประกอบ / ขึ้นรูป / ติดตั้ง
  active    boolean not null default true,  -- false = left the company (history kept, hidden on the board)
  sort      int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_projects (
  code      text primary key,               -- UCT-D3, HAM-500, SMT-5270, SERVICE …
  name      text not null,
  customer  text,
  job_no    text,                           -- RAK Job no. (e.g. 04002026) once known
  status    text not null default 'active' check (status in ('active','hold','postponed','cancelled','done')),
  color     text not null default '#6d7582',
  sort      int not null default 0,
  note      text,
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_milestones (
  id           bigserial primary key,
  project_code text not null references public.mp_projects(code) on update cascade,
  day          date not null,
  label        text not null                -- FAT / รื้อ / Pack / Delivery / ติดตั้ง / SAT …
);
create index if not exists mp_milestones_day on public.mp_milestones (day);

-- One planned activity per person per day.
create table if not exists public.mp_assignments (
  id           bigserial primary key,
  worker_id    text not null references public.mp_workers(id) on update cascade,
  day          date not null,
  project_code text references public.mp_projects(code) on update cascade,
  kind         text not null default 'work' check (kind in ('work','admin','internal','other')),
  text         text not null,               -- activity as written (e.g. "UCT Double#3 Support Pump")
  tentative    boolean not null default false, -- "จอง …" in the sheet
  source       text not null default 'app', -- 'sheet' = imported
  updated_by   text,
  updated_at   timestamptz not null default now(),
  unique (worker_id, day)
);
create index if not exists mp_assignments_day on public.mp_assignments (day);
create index if not exists mp_assignments_project on public.mp_assignments (project_code, day);

-- Day off / leave per person (H = weekly day off, PH = public holiday, EX = special company holiday).
create table if not exists public.mp_absences (
  worker_id  text not null references public.mp_workers(id) on update cascade,
  day        date not null,
  type       text not null,                 -- H / PH / EX / พักร้อน / ลาป่วย / ลาป่วยครึ่งวัน / ลากิจ / ลาไม่รับค่าจ้าง / ลา / สลับวันหยุด
  note       text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (worker_id, day)
);
create index if not exists mp_absences_day on public.mp_absences (day);

create table if not exists public.mp_holidays (
  day   date primary key,
  type  text not null default 'PH',
  name  text
);

-- Who changed what (replaces the "Rev." copies of the sheet tab). Filled from Phase 2 on.
create table if not exists public.mp_change_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  by_user    text not null,
  action     text not null,
  detail     jsonb
);

alter table public.mp_workers     enable row level security;
alter table public.mp_projects    enable row level security;
alter table public.mp_milestones  enable row level security;
alter table public.mp_assignments enable row level security;
alter table public.mp_absences    enable row level security;
alter table public.mp_holidays    enable row level security;
alter table public.mp_change_log  enable row level security;
