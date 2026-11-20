-- SSM Work · QA Tools — tool & measuring-equipment register, borrow / return, annual calibration.
-- Run once in the Supabase project used by ssmwork.vercel.app: Dashboard → SQL Editor → New query → Run.
-- Only the hub middleware (service key) reads and writes these tables: RLS is on and there are no policies.
-- Custodian (register, documents, receive returns, calibration): อาร์ต · Approver (calibration results, retire / dispose): ดิว.

create table if not exists public.qa_tools (
  id              bigint generated always as identity primary key,
  asset_no        text not null,                 -- รหัสเครื่องมือ (ตามสติกเกอร์ เช่น PM-03, ST-05)
  fixed_asset_no  text,                          -- รหัสทรัพย์สิน (AP02-xxxxx) ถ้ามี
  name            text not null,
  category        text,                          -- measuring / electrical / hand tool / power tool / safety / other
  brand           text,
  model           text,
  serial_no       text,
  spec            text,                          -- range / resolution / accuracy
  location        text,                          -- where it is kept
  owner_name      text,                          -- ผู้ถือครอง
  department      text,                          -- แผนก
  lendable        boolean not null default false, -- เครื่องมือกลาง ให้ยืมได้
  purchase_date   date,                          -- วันที่เริ่มใช้ (ใช้คำนวณอายุ)
  price           numeric(12,2),
  needs_cal       boolean not null default true, -- ต้องสอบเทียบ
  cal_interval_m  int not null default 12,
  last_cal_date   date,
  next_cal_due    date,
  status          text not null default 'available',   -- available | on_loan | calibration | repair | lost | retire_pending | retired
  photos          jsonb not null default '[]'::jsonb,  -- [{p, at, by}]
  docs            jsonb not null default '[]'::jsonb,  -- [{p, name, kind, at, by}]  manual, certificate, purchase doc
  note            text,
  retire_reason   text,
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists qa_tools_asset_no on public.qa_tools (lower(asset_no));

create table if not exists public.qa_tool_loans (
  id              bigint generated always as identity primary key,
  tool_id         bigint not null references public.qa_tools(id) on delete cascade,
  borrower        text not null,                 -- username
  borrower_name   text,
  job_no          text,
  customer        text,
  site            text,
  purpose         text,
  out_at          timestamptz not null default now(),
  due_back        date,
  return_requested_at timestamptz,
  returned_at     timestamptz,
  return_condition text,                         -- ok | damaged | missing_parts
  return_note     text,
  received_by     text,
  status          text not null default 'out'    -- out | return_requested | returned
);
create index if not exists qa_tool_loans_tool on public.qa_tool_loans (tool_id, out_at desc);
create index if not exists qa_tool_loans_open on public.qa_tool_loans (status) where status <> 'returned';

create table if not exists public.qa_tool_cals (
  id              bigint generated always as identity primary key,
  tool_id         bigint not null references public.qa_tools(id) on delete cascade,
  sent_date       date,
  lab             text,
  cal_date        date,
  cert_no         text,
  result          text,                          -- pass | adjusted | fail
  next_due        date,
  cost            numeric(12,2),
  docs            jsonb not null default '[]'::jsonb,
  note            text,
  status          text not null default 'sent',  -- sent | pending_verify | pending_approval | approved | rejected  (verify: database/qa_tools-002.sql)
  approved_by     text,
  approved_at     timestamptz,
  approve_note    text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists qa_tool_cals_tool on public.qa_tool_cals (tool_id, created_at desc);

create table if not exists public.qa_tool_log (
  id       bigint generated always as identity primary key,
  tool_id  bigint references public.qa_tools(id) on delete cascade,
  at       timestamptz not null default now(),
  by       text,
  action   text,
  detail   text
);
create index if not exists qa_tool_log_tool on public.qa_tool_log (tool_id, at desc);

alter table public.qa_tools      enable row level security;
alter table public.qa_tool_loans enable row level security;
alter table public.qa_tool_cals  enable row level security;
alter table public.qa_tool_log   enable row level security;

-- private bucket for tool photos and documents (calibration certificates, manuals) — max 5 MB each
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-tools', 'qa-tools', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Added 20 Nov 2026 (ผู้ถือครอง / แผนก / ให้ยืมได้ / รหัสทรัพย์สิน) — safe to run again on a database that already has the tables
alter table public.qa_tools add column if not exists fixed_asset_no text;
alter table public.qa_tools add column if not exists department text;
alter table public.qa_tools add column if not exists lendable boolean not null default false;
