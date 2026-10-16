-- Run only in Supabase SQL Editor as an administrator.
-- Replace the placeholder with the actual email approved by the project owner.
-- This sends no invitation and does not create a password or mark an email verified.
begin;
do $$
declare approved_email text:=lower(trim('REPLACE_WITH_APPROVED_EMAIL'));
begin
 if position('@' in approved_email)<2 then raise exception 'Replace the approved email placeholder'; end if;
 insert into ssm_private.trial_email_access(batch_id,email,is_active)
 select id,approved_email,true from public.ssm_trial_imports where state='READY'
 on conflict(batch_id,email) do update set is_active=true;
 insert into public.ssm_trial_members(batch_id,user_id,is_active)
 select a.batch_id,u.id,true from ssm_private.trial_email_access a join auth.users u on lower(u.email)=a.email
 where a.email=approved_email and a.is_active and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false
 on conflict(batch_id,user_id) do update set is_active=true;
end $$;
commit;
