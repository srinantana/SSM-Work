begin;
create sequence public.ssm_project_number_seq start 1;
revoke all on sequence public.ssm_project_number_seq from public,anon,authenticated;
grant usage on sequence public.ssm_project_number_seq to authenticated;
create function public.ssm_next_project_number() returns text language plpgsql security invoker set search_path='' as $$
declare n text; begin n:=nextval('public.ssm_project_number_seq'::regclass)::text; return 'SSM-EEXP-'||lpad(n,greatest(3,length(n)),'0'); end;
$$;
revoke all on function public.ssm_next_project_number() from public,anon;
grant execute on function public.ssm_next_project_number() to authenticated;
alter table public.ssm_projects alter column project_no set default public.ssm_next_project_number();
alter table public.ssm_projects add column revision bigint not null default 1;
alter table public.ssm_projects add column updated_at timestamptz not null default now();
create function ssm_private.project_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=old.revision+1;new.updated_at:=clock_timestamp();return new;end;
$$;
revoke all on function ssm_private.project_revision() from public,anon,authenticated;
create trigger ssm_project_revision before update on public.ssm_projects for each row execute function ssm_private.project_revision();
grant update(customer_key,name,quotation_ref,work_type,region,country,site,start_date,end_date,travel_days,notes) on public.ssm_projects to authenticated;
create policy projects_owner_edit on public.ssm_projects for update to authenticated
 using(owner_id=(select auth.uid()) and status='DRAFT' and exists(select 1 from public.ssm_trial_members m where m.batch_id=ssm_projects.batch_id and m.user_id=(select auth.uid()) and m.is_active))
 with check(owner_id=(select auth.uid()) and status='DRAFT' and exists(select 1 from public.ssm_trial_members m where m.batch_id=ssm_projects.batch_id and m.user_id=(select auth.uid()) and m.is_active));
commit;
