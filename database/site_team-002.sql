-- SSM Work · Site Team migration 002 (17 Nov 2026) — run once in Supabase SQL Editor after database/site_team.sql.
-- Group for people who are not on the Manpower board: EN = Engineer, SP = Support, OT = Other (null = not set).
-- People linked to Manpower (worker_id) take their team from mp_workers.unit instead. Safe to run again.

alter table public.site_team_people add column if not exists team text;
do $$ begin
  alter table public.site_team_people add constraint site_team_people_team check (team is null or team in ('EN','SP','OT'));
exception when duplicate_object then null; end $$;
