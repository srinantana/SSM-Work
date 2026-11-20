-- SSM Work · Team Tracking — small to-dos of the team (documents, plans, estimates, reports) with due dates,
-- assignee, repeat (weekly report …) and notes. Run once in Supabase: Dashboard → SQL Editor → New query → Run.
-- Only the hub middleware (service key) reads and writes it: RLS on, no policies.

create table if not exists public.tt_tasks (
  id               bigint generated always as identity primary key,
  title            text not null,
  detail           text,
  category         text,                       -- doc | plan | estimate | report | other
  job_no           text,
  customer         text,
  assignee         text not null,              -- username
  assignee_name    text,
  created_by       text not null,
  created_by_name  text,
  due              date,
  priority         text not null default 'normal',   -- normal | high
  status           text not null default 'todo',     -- todo | doing | done | cancelled
  repeat           text not null default '',         -- '' | daily | weekly | monthly — next one is created when this is done
  notes            jsonb not null default '[]'::jsonb, -- [{at, by, text}]
  done_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tt_tasks_assignee on public.tt_tasks (assignee, status);
create index if not exists tt_tasks_open on public.tt_tasks (status, due);

alter table public.tt_tasks enable row level security;
