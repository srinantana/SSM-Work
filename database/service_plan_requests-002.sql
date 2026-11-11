-- SSM Work · Service Plan — ขอคน 002: งานรอนัดวัน (job noted before the customer confirms a date) — 11 Nov 2026
-- Run once in Supabase (SQL Editor → New query → Run) after database/service_plan_requests.sql. Safe to run again.
-- A draft has no dates and no people yet; expect_date / expect_note say roughly when the job is expected.
-- SSM Work shows a reminder at the top of every page from 3 weeks before expect_date until the job gets real dates.

alter table public.sp_requests alter column date_from drop not null;
alter table public.sp_requests alter column date_to   drop not null;
alter table public.sp_requests add column if not exists draft       boolean not null default false;
alter table public.sp_requests add column if not exists expect_date date;
alter table public.sp_requests add column if not exists expect_note text;

notify pgrst, 'reload schema';
