-- Six-category Draft estimator. All writes use the signed-in owner's RLS.
-- A database trigger resolves Master snapshots and computes money in decimal arithmetic.
begin;
create table public.ssm_project_estimates (
 project_id uuid primary key references public.ssm_projects(id),
 project_revision bigint not null,
 revision bigint not null default 1,
 document jsonb not null,
 subtotal_thb numeric(16,2) not null default 0,
 total_thb numeric(16,2),
 incomplete_count integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.ssm_project_estimates enable row level security;
revoke all on public.ssm_project_estimates from public,anon,authenticated;
grant select on public.ssm_project_estimates to authenticated;
grant insert(project_id,project_revision,document),update(project_revision,document) on public.ssm_project_estimates to authenticated;
create policy estimates_owner_read on public.ssm_project_estimates for select to authenticated using (
 exists(select 1 from public.ssm_projects p join public.ssm_trial_members m on m.batch_id=p.batch_id join public.ssm_trial_imports b on b.id=p.batch_id
 where p.id=ssm_project_estimates.project_id and p.owner_id=(select auth.uid()) and m.user_id=(select auth.uid()) and m.is_active and b.state='READY')
);
create policy estimates_owner_insert on public.ssm_project_estimates for insert to authenticated with check (
 exists(select 1 from public.ssm_projects p join public.ssm_trial_members m on m.batch_id=p.batch_id join public.ssm_trial_imports b on b.id=p.batch_id
 where p.id=ssm_project_estimates.project_id and p.owner_id=(select auth.uid()) and p.status='DRAFT' and m.user_id=(select auth.uid()) and m.is_active and b.state='READY')
);
create policy estimates_owner_update on public.ssm_project_estimates for update to authenticated using (
 exists(select 1 from public.ssm_projects p join public.ssm_trial_members m on m.batch_id=p.batch_id join public.ssm_trial_imports b on b.id=p.batch_id
 where p.id=ssm_project_estimates.project_id and p.owner_id=(select auth.uid()) and p.status='DRAFT' and m.user_id=(select auth.uid()) and m.is_active and b.state='READY')
) with check (
 exists(select 1 from public.ssm_projects p join public.ssm_trial_members m on m.batch_id=p.batch_id join public.ssm_trial_imports b on b.id=p.batch_id
 where p.id=ssm_project_estimates.project_id and p.owner_id=(select auth.uid()) and p.status='DRAFT' and m.user_id=(select auth.uid()) and m.is_active and b.state='READY')
);
create function ssm_private.validate_estimate() returns trigger language plpgsql security invoker set search_path='' as $$
declare
 p public.ssm_projects%rowtype; r public.ssm_rate_versions%rowtype;
 d jsonb; settings jsonb; included jsonb; items jsonb:='[]'; item jsonb; snapshot jsonb;
 section text; u text; name text; qtext text; ptext text; rtext text; rid text; mapped text;
 q numeric; periods numeric; price numeric; amount numeric; subtotal numeric:=0; missing integer:=0; ready boolean;
 people numeric; rooms numeric; vehicles numeric; days integer; nights integer; pricing date; ids text[]:='{}';
begin
 -- Serialize project edits and estimate saves so a date change cannot race a save.
 select * into p from public.ssm_projects where id=new.project_id and owner_id=auth.uid() for update;
 if not found or p.status<>'DRAFT' or not exists(select 1 from public.ssm_trial_members m join public.ssm_trial_imports b on b.id=m.batch_id where m.batch_id=p.batch_id and m.user_id=auth.uid() and m.is_active and b.state='READY') then
  raise exception 'Draft access denied' using errcode='42501';
 end if;
 if new.project_revision<>p.revision then raise exception 'PROJECT_CHANGED' using errcode='40001';end if;
 d:=new.document;
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>300000 or jsonb_typeof(d->'settings') is distinct from 'object' or jsonb_typeof(d->'lines') is distinct from 'array' or jsonb_array_length(d->'lines')>150 then raise exception 'Invalid estimate document';end if;
 settings:=d->'settings';included:=d->'included';
 if jsonb_typeof(included) is distinct from 'object' then raise exception 'Invalid categories';end if;
 foreach section in array array['manpower','subcontract','accommodation','travel','transport','site_expense'] loop
  if jsonb_typeof(included->section) is distinct from 'boolean' then raise exception 'Invalid category selection';end if;
 end loop;
 if (settings->>'start_date') is distinct from p.start_date::text or (settings->>'end_date') is distinct from p.end_date::text or (settings->>'travel_days') is distinct from p.travel_days::text then raise exception 'PROJECT_CHANGED' using errcode='40001';end if;
 if not coalesce(settings->>'people','')~'^[0-9]{1,4}$' or not coalesce(settings->>'rooms','')~'^[0-9]{1,4}$' or not coalesce(settings->>'vehicles','')~'^[0-9]{1,4}$' then raise exception 'Invalid resource quantities';end if;
 people:=(settings->>'people')::numeric;rooms:=(settings->>'rooms')::numeric;vehicles:=(settings->>'vehicles')::numeric;
 if least(people,rooms,vehicles)<1 then raise exception 'Resources must be positive';end if;
 if not coalesce(settings->>'pricing_date','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid pricing date';end if;
 pricing:=(settings->>'pricing_date')::date;
 if pricing<date '2000-01-01' or pricing>date '2100-12-31' then raise exception 'Invalid pricing date';end if;
 days:=p.end_date-p.start_date+1;nights:=p.end_date-p.start_date;
 for item in select value from jsonb_array_elements(d->'lines') loop
  if jsonb_typeof(item) is distinct from 'object' or not coalesce(item->>'id','')~'^[0-9a-fA-F-]{36}$' or item->>'id'=any(ids) then raise exception 'Invalid line identity';end if;
  ids:=array_append(ids,item->>'id');section:=item->>'section';u:=item->>'unit';name:=trim(coalesce(item->>'name',''));
  if section is null or section not in ('manpower','subcontract','accommodation','travel','transport','site_expense') or u is null or u not in ('person/day','person/hour','person/half day','room/night','room/month','vehicle/day','vehicle/round trip','vehicle/site trip','person/trip','km','lot','kg','trip') then raise exception 'Invalid category or unit';end if;
  if length(name)>200 or length(coalesce(item->>'reason',''))>500 or length(coalesce(item->>'notes',''))>1000 then raise exception 'Line text too long';end if;
  if coalesce(item->>'quantity_mode','') not in ('auto','manual') or coalesce(item->>'period_mode','') not in ('auto','manual') or coalesce(item->>'rate_mode','') not in ('master','manual') then raise exception 'Invalid calculation mode';end if;
  qtext:=coalesce(item->>'quantity','');ptext:=coalesce(item->>'periods','');rtext:=coalesce(item->>'rate','');snapshot:=null;
  if item->>'quantity_mode'='auto' then
   if u like 'person/%' then qtext:=people::text;elsif u like 'room/%' then qtext:=rooms::text;elsif u like 'vehicle/%' then qtext:=vehicles::text;else raise exception 'Quantity cannot be automated for this unit';end if;
  end if;
  if item->>'period_mode'='auto' then
   if u='room/night' then ptext:=nights::text;elsif u in ('person/day','vehicle/day') then ptext:=days::text;else raise exception 'Periods cannot be automated for this unit';end if;
  end if;
  rid:=coalesce(item->>'rate_id','');
  if rid<>'' then
   select * into r from public.ssm_rate_versions where id=rid::uuid and batch_id=p.batch_id and publication_status='ACTIVE';
   if not found then raise exception 'Rate not available to this project';end if;
   mapped:=case when r.category='ALLOWANCE' then 'manpower' when r.unit like 'vehicle/%' or r.unit='km' then 'transport' when r.source_key like 'LEG-ADD-INSTALL%' then 'subcontract' else 'site_expense' end;
   if r.unit<>u or mapped<>section or r.currency<>'THB' or (r.location='Local' and p.region<>'DOMESTIC') then raise exception 'Rate is not applicable';end if;
   snapshot:=jsonb_build_object('id',r.id,'source_key',r.source_key,'version_key',r.version_key,'category',r.category,'name',r.name,'unit',r.unit,'amount',r.amount,'currency',r.currency,'country',r.country,'location',r.location,'valid_from',r.valid_from,'valid_to',r.valid_to);
   if item->>'rate_mode'='master' then
    if pricing between r.valid_from and r.valid_to then rtext:=r.amount::text;else rtext:='';end if;
   end if;
  elsif item->>'rate_mode'='master' then rtext:='';end if;
  foreach mapped in array array[qtext,ptext,rtext] loop
   if mapped<>'' and not mapped~'^[0-9]{1,8}(\.[0-9]{1,6})?$' then raise exception 'Invalid decimal value';end if;
  end loop;
  q:=nullif(qtext,'')::numeric;periods:=nullif(ptext,'')::numeric;price:=nullif(rtext,'')::numeric;
  ready:=name<>'' and q>0 and periods is not null and price is not null and (item->>'rate_mode'='master' or trim(coalesce(item->>'reason',''))<>'');
  amount:=case when ready then round(q*periods*price,2) else null end;
  if amount>1000000000000 then raise exception 'Estimate amount exceeds limit';end if;
  if (included->>section)::boolean then
   if amount is null then missing:=missing+1;else subtotal:=subtotal+amount;end if;
  end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',item->>'id','section',section,'name',name,'unit',u,'quantity_mode',item->>'quantity_mode','quantity',coalesce(item->>'quantity',''),'period_mode',item->>'period_mode','periods',coalesce(item->>'periods',''),'rate_mode',item->>'rate_mode','rate_id',rid,'rate',coalesce(item->>'rate',''),'reason',trim(coalesce(item->>'reason','')),'notes',coalesce(item->>'notes',''),'snapshot',snapshot,'quantity_resolved',q,'periods_resolved',periods,'amount_thb',amount));
 end loop;
 if subtotal>1000000000000 then raise exception 'Estimate total exceeds limit';end if;
 new.document:=jsonb_build_object('settings',settings,'included',included,'lines',items);
 new.subtotal_thb:=subtotal;new.total_thb:=case when missing=0 then subtotal else null end;new.incomplete_count:=missing;
 new.updated_at:=clock_timestamp();new.revision:=case when tg_op='UPDATE' then old.revision+1 else 1 end;
 return new;
end;
$$;
revoke all on function ssm_private.validate_estimate() from public,anon,authenticated;
create trigger validate_project_estimate before insert or update on public.ssm_project_estimates for each row execute function ssm_private.validate_estimate();
commit;
