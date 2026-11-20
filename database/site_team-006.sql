-- SSM Work · Site Team migration 006 (20 Nov 2026) — run once in Supabase SQL Editor.
-- Start date of a person's travel insurance (annual policy period = insurance_start → insurance_expiry), so a trip can
-- tell who is already covered by an annual policy and who still needs per-trip insurance. Safe to run again.

alter table public.site_team_people add column if not exists insurance_start date;
