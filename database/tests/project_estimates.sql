begin;
do $$ declare fixture uuid; begin
 insert into public.ssm_projects(project_no,owner_id,batch_id,customer_key,name,work_type,region,country,site,start_date,end_date,travel_days)
 select 'TEST-'||gen_random_uuid(),owner_id,batch_id,customer_key,'Temporary estimate test','SERVICE','DOMESTIC','ไทย','Test only',date '2026-10-17',date '2026-10-19',2 from public.ssm_projects where name='ทดสอบสร้างโครงการ 16-10-2026' limit 1 returning id into fixture;
 perform set_config('ssm.test_project',fixture::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from public.ssm_projects where id=fixture),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare p public.ssm_projects%rowtype;r public.ssm_rate_versions%rowtype;d jsonb;e public.ssm_project_estimates%rowtype;changed integer;bad boolean:=false;
begin
 select * into p from public.ssm_projects where id=current_setting('ssm.test_project')::uuid and owner_id=auth.uid();
 if not found then raise exception 'Test fixture missing';end if;
 select * into r from public.ssm_rate_versions where batch_id=p.batch_id and source_key='LEG-ALL-76';
 d:=jsonb_build_object('settings',jsonb_build_object('people','3','rooms','2','vehicles','1','start_date',p.start_date,'end_date',p.end_date,'travel_days',p.travel_days,'pricing_date','2026-10-17'),
 'included',jsonb_build_object('manpower',true,'subcontract',true,'accommodation',true,'travel',true,'transport',true,'site_expense',true),
 'lines',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'section','manpower','name','Test allowance','unit','person/day','quantity_mode','auto','quantity','1','period_mode','auto','periods','1','rate_mode','master','rate_id',r.id,'rate','999999','reason','','notes','','snapshot',jsonb_build_object('amount',999999),'amount_thb',999999)));
 insert into public.ssm_project_estimates(project_id,project_revision,document) values(p.id,p.revision,d) returning * into e;
 if e.total_thb<>3*(p.end_date-p.start_date+1)*150 or e.document->'lines'->0->'snapshot'->>'amount'<>'150.000000' and (e.document->'lines'->0->'snapshot'->>'amount')::numeric<>150 then raise exception 'Master total/snapshot mismatch';end if;
 update public.ssm_project_estimates set document=jsonb_set(d,'{lines,0,rate_mode}','"manual"') where project_id=p.id and revision=e.revision returning * into e;
 if e.total_thb is not null or e.incomplete_count<>1 then raise exception 'Missing override explanation must remain incomplete';end if;
 update public.ssm_project_estimates set document=d where project_id=p.id and revision=e.revision-1;
 get diagnostics changed=row_count;if changed<>0 then raise exception 'Stale overwrite';end if;
 begin update public.ssm_project_estimates set total_thb=1 where project_id=p.id;exception when insufficient_privilege then bad:=true;end;
 if not bad then raise exception 'Forged total allowed';end if;
 d:=jsonb_set(d,'{settings,pricing_date}','"2028-01-01"');
 update public.ssm_project_estimates set document=d where project_id=p.id returning * into e;
 if e.total_thb is not null or e.incomplete_count<>1 then raise exception 'Expired Master silently charged';end if;
 d:=jsonb_set(d,'{lines,0,rate_mode}','"manual"');d:=jsonb_set(d,'{lines,0,rate}','"1.005"');d:=jsonb_set(d,'{lines,0,reason}','"Test quote"');
 d:=jsonb_set(d,'{lines,0,quantity_mode}','"manual"');d:=jsonb_set(d,'{lines,0,quantity}','"1"');d:=jsonb_set(d,'{lines,0,period_mode}','"manual"');d:=jsonb_set(d,'{lines,0,periods}','"1"');
 update public.ssm_project_estimates set document=d where project_id=p.id returning * into e;
 if e.total_thb<>1.01 then raise exception 'Decimal rounding mismatch';end if;
 update public.ssm_projects set notes=notes where id=p.id;
 bad:=false;begin update public.ssm_project_estimates set document=d where project_id=p.id;exception when serialization_failure then bad:=true;end;
 if not bad then raise exception 'Project revision race not stopped';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare n integer;begin
 select count(*) into n from public.ssm_project_estimates;if n<>0 then raise exception 'Cross-owner read';end if;
 update public.ssm_project_estimates set document='{}';get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner update';end if;
end $$;
reset role;
select jsonb_build_object('owner_calculation','PASS','master_snapshot','PASS','incomplete_draft','PASS','expired_rate','PASS','rounding','PASS','stale_revision','PASS','project_race','PASS','forged_total','PASS','cross_owner','PASS','anon_select_denied',not has_table_privilege('anon','public.ssm_project_estimates','SELECT'),'anon_insert_denied',not has_any_column_privilege('anon','public.ssm_project_estimates','INSERT')) as tests;
rollback;
