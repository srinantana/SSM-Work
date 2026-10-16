-- Replace placeholder; disables both future claims and existing membership.
begin;
update ssm_private.trial_email_access set is_active=false where email=lower('REPLACE_WITH_APPROVED_EMAIL');
update public.ssm_trial_members m set is_active=false from auth.users u
where m.user_id=u.id and lower(u.email)=lower('REPLACE_WITH_APPROVED_EMAIL');
commit;
