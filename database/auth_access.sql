-- Only database administrators can approve an email. Signup alone grants no data access.
create schema if not exists ssm_private;
revoke all on schema ssm_private from public,anon;
grant usage on schema ssm_private to authenticated;
create table ssm_private.trial_email_access (
 batch_id uuid not null references public.ssm_trial_imports(id),
 email text not null check(email=lower(trim(email)) and position('@' in email)>1),
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(batch_id,email)
);
alter table ssm_private.trial_email_access enable row level security;
create policy trial_email_access_no_client_access on ssm_private.trial_email_access for all to anon,authenticated using(false) with check(false);
revoke all on ssm_private.trial_email_access from public,anon,authenticated;
create function ssm_private.claim_trial_access() returns integer language plpgsql security definer set search_path='' as $$
declare uid uuid; verified_email text; added integer;
begin
 uid:=(select auth.uid());
 if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select lower(u.email) into verified_email from auth.users u
 where u.id=uid and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false;
 if verified_email is null then raise exception 'Verified email required' using errcode='28000'; end if;
 insert into public.ssm_trial_members(batch_id,user_id,is_active)
 select a.batch_id,uid,true from ssm_private.trial_email_access a
 join public.ssm_trial_imports b on b.id=a.batch_id and b.state='READY'
 where a.email=verified_email and a.is_active
 on conflict(batch_id,user_id) do nothing;
 get diagnostics added=row_count;
 return added;
end;
$$;
revoke all on function ssm_private.claim_trial_access() from public,anon;
grant execute on function ssm_private.claim_trial_access() to authenticated;
create function public.ssm_claim_trial_access() returns integer language sql security invoker set search_path='' as $$
 select ssm_private.claim_trial_access();
$$;
revoke all on function public.ssm_claim_trial_access() from public,anon;
grant execute on function public.ssm_claim_trial_access() to authenticated;
