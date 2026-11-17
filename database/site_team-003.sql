-- SSM Work · Site Team migration 003 (17 Nov 2026) — run once in Supabase SQL Editor after site_team-002.sql.
-- Visas per country: visas = [{ "country": "ญี่ปุ่น", "type": "Business", "visa_no": "", "issue": "", "expiry": "2026-09-11", "note": "" }, ...]
-- Copies the old free-text note "วีซ่าญี่ปุ่น หมดอายุ 2026-09-11" into one Japan row. Safe to run again.

alter table public.site_team_people add column if not exists visas jsonb not null default '[]'::jsonb;

update public.site_team_people
set visas = jsonb_build_array(jsonb_build_object(
      'country', 'ญี่ปุ่น', 'type', '', 'visa_no', '', 'issue', '',
      'expiry', coalesce(substring(visa_note from '\d{4}-\d{2}-\d{2}'), ''), 'note', ''))
where visas = '[]'::jsonb and visa_note ~ 'วีซ่าญี่ปุ่น';
