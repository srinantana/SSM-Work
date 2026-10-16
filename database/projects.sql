-- Draft projects: no approval or costing state is implied by saving a project.
create table public.ssm_projects (
 id uuid primary key default gen_random_uuid(),
 project_no text not null unique default ('PRJ-' || upper(replace(gen_random_uuid()::text,'-',''))),
 owner_id uuid not null default auth.uid() references auth.users(id),
 batch_id uuid not null references public.ssm_trial_imports(id),
 customer_key text not null,
 name text not null check(char_length(trim(name)) between 1 and 160),
 quotation_ref text not null default '' check(char_length(quotation_ref)<=80),
 work_type text not null check(work_type in ('INSTALLATION','COMMISSIONING','SAT','SERVICE','TRAINING')),
 region text not null check(region in ('DOMESTIC','OVERSEAS')),
 country text not null check(char_length(trim(country)) between 1 and 100),
 site text not null check(char_length(trim(site)) between 1 and 240),
 start_date date not null,
 end_date date not null check(end_date>=start_date),
 travel_days integer not null default 0 check(travel_days between 0 and 365),
 notes text not null default '' check(char_length(notes)<=2000),
 status text not null default 'DRAFT' check(status='DRAFT'),
 created_at timestamptz not null default now(),
 unique(owner_id,id),
 foreign key(batch_id,customer_key) references public.ssm_trial_customers(batch_id,source_key)
);
create index ssm_projects_owner_created_idx on public.ssm_projects(owner_id,created_at desc);
create index ssm_projects_customer_idx on public.ssm_projects(batch_id,customer_key);
alter table public.ssm_projects enable row level security;
revoke all on public.ssm_projects from public,anon,authenticated;
grant select on public.ssm_projects to authenticated;
grant insert(id,batch_id,customer_key,name,quotation_ref,work_type,region,country,site,start_date,end_date,travel_days,notes) on public.ssm_projects to authenticated;
create policy projects_owner_read on public.ssm_projects for select to authenticated
 using(owner_id=(select auth.uid()) and batch_id in (select id from public.ssm_trial_imports where state='READY'));
create policy projects_owner_create on public.ssm_projects for insert to authenticated
 with check(owner_id=(select auth.uid()) and status='DRAFT' and batch_id in (select id from public.ssm_trial_imports where state='READY'));
