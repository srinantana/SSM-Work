-- SSM Work · Site Team migration 008 (20 Nov 2026) — run once in Supabase SQL Editor.
-- Fill วันที่ต้องต่อ (renew_due) = 3 months before expiry on certificates that have an expiry but no renew date yet.
-- From now on the hub fills it on save; จป can change it. Safe to run again.

update public.site_team_certs
set renew_due = (expiry - interval '3 months')::date, updated_at = now()
where expiry is not null and renew_due is null and not no_expiry;
