-- SSM Work · Site Team migration 005 (20 Nov 2026) — run once in Supabase SQL Editor.
-- Trip kind + status. kind: install (Job from Get Award) / survey / service — the Job no. is typed freely for survey
-- and service, so the kind can no longer be read from a prefix. status: draft (people may still lack a passport) /
-- confirmed (everyone has a passport valid 6 months after the return date — checked by the hub). Safe to run again.

alter table public.site_team_trips add column if not exists kind   text;
alter table public.site_team_trips add column if not exists status text not null default 'draft';
update public.site_team_trips set kind = case when job_no ~* '^IJ' then 'survey' when job_no ~* '^(IS|IN|SO|WR)' then 'service' else 'install' end
where kind is null;
