-- Publish a separate immutable snapshot; never overwrite historical imported prices.
-- Authorized decisions: 2026-01-01 through 2027-12-31 inclusive; all source prices THB;
-- activate only complete entries. No approval workflow or unresolved cost policy is enabled.
begin;
create table public.ssm_rate_versions (
 id uuid primary key default gen_random_uuid(),
 version_key text not null,
 batch_id uuid not null references public.ssm_trial_imports(id),
 source_rate_id uuid not null references public.ssm_trial_rates(id),
 source_key text not null,
 category text not null,
 name text not null,
 country text,
 location text,
 amount numeric(20,6) not null check(amount>0),
 currency text not null check(currency='THB'),
 unit text not null check(length(trim(unit))>0 and unit not ilike '%OPEN%' and unit not ilike '%confirm%'),
 valid_from date not null,
 valid_to date not null check(valid_to>=valid_from),
 publication_status text not null default 'ACTIVE' check(publication_status in ('ACTIVE','RETIRED')),
 published_at timestamptz not null default now(),
 publication_basis text not null,
 source_snapshot jsonb not null,
 unique(version_key,source_rate_id)
);
create index ssm_rate_versions_batch_period_idx on public.ssm_rate_versions(batch_id,valid_from,valid_to);
create index ssm_rate_versions_source_idx on public.ssm_rate_versions(source_rate_id);
alter table public.ssm_rate_versions enable row level security;
revoke all on public.ssm_rate_versions from public,anon,authenticated;
grant select on public.ssm_rate_versions to authenticated;
create policy rate_versions_member_read on public.ssm_rate_versions for select to authenticated
 using(exists(select 1 from public.ssm_trial_members m join public.ssm_trial_imports b on b.id=m.batch_id where m.batch_id=ssm_rate_versions.batch_id and m.user_id=(select auth.uid()) and m.is_active=true and b.state='READY'));
create function public.ssm_active_rates(p_pricing_date date)
returns table(id uuid,version_key text,source_key text,category text,name text,country text,location text,amount numeric,currency text,unit text,valid_from date,valid_to date)
language sql stable security invoker set search_path='' as $$
 select r.id,r.version_key,r.source_key,r.category,r.name,r.country,r.location,r.amount,r.currency,r.unit,r.valid_from,r.valid_to
 from public.ssm_rate_versions r where r.publication_status='ACTIVE' and p_pricing_date between r.valid_from and r.valid_to
 order by r.source_key;
$$;
revoke all on function public.ssm_active_rates(date) from public,anon;
grant execute on function public.ssm_active_rates(date) to authenticated;
-- Explicit source batch selection; no generated IDs are hard-coded.
insert into public.ssm_rate_versions(version_key,batch_id,source_rate_id,source_key,category,name,country,location,amount,currency,unit,valid_from,valid_to,publication_basis,source_snapshot)
select 'RAK-2026-2027-v1',r.batch_id,r.id,r.source_key,r.category,r.name,r.country,r.location,r.amount,'THB',r.unit,date '2026-01-01',date '2027-12-31',
 'User confirmed 2026-01-01 to 2027-12-31 inclusive, all source prices THB, activate complete entries only. Simple base amount per stated unit; no OT, eligibility, FX, VAT or final estimate approval implied.',to_jsonb(r)
from public.ssm_trial_rates r join public.ssm_trial_imports b on b.id=r.batch_id
where b.batch_key='ssm_legacy_trial_20261016_b10c5455f2cc' and b.state='READY'
 and r.review_status='REVIEW_REQUIRED' and r.amount>0 and r.currency='THB'
 and ((r.category='ALLOWANCE' and r.location='Local' and r.unit='person/day')
   or (r.category='TRAVEL' and r.unit in ('vehicle/round trip','vehicle/site trip'))
   or (r.category='OTHER' and r.unit in ('km','person/day','person/half day','lot')));
do $$ begin
 if (select count(*) from public.ssm_rate_versions where version_key='RAK-2026-2027-v1')<>63 then raise exception 'Publication count changed; inspect source before publishing'; end if;
end $$;
update public.ssm_trial_imports set summary=summary || jsonb_build_object('rate_publication',jsonb_build_object(
 'version_key','RAK-2026-2027-v1','valid_from','2026-01-01','valid_to','2027-12-31','end_date_inclusive',true,'currency','THB','currency_confirmed',true,
 'active_count',63,'held_count',2037,'note','Complete base-rate snapshots only. Accommodation inclusions, ambiguous transport units, overseas category mapping, missing prices, deprecated and OPEN units remain held.'))
where batch_key='ssm_legacy_trial_20261016_b10c5455f2cc';
commit;
