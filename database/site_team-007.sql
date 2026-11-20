-- SSM Work · Site Team migration 007 (20 Nov 2026) — run once in Supabase SQL Editor.
-- Link to the travel insurance policy document (Google Drive) per person. Safe to run again.

alter table public.site_team_people add column if not exists insurance_file text;
