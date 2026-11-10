-- SSM Work · Manpower migration 002 (11 Nov 2026) — run once in Supabase SQL Editor after database/manpower.sql.
-- 1) work type per planned day: Fab / Assembly / Install / Service / Other (chosen when SC / PC / SSM add work on the board)
-- 2) customer on every imported project, so the board can filter customer → job
-- 3) best-guess work type for the rows imported from the Google Sheet (from the wording of each cell)
-- Safe to run again.

alter table public.mp_assignments add column if not exists work_type text not null default 'other';
do $$ begin
  alter table public.mp_assignments add constraint mp_assignments_work_type check (work_type in ('fab','assembly','install','service','other'));
exception when duplicate_object then null; end $$;

update public.mp_projects set customer = c.customer from (values
  ('PANDORA-AAA','Pandora'), ('PANDORA','Pandora'), ('DAISIN','Daisin'), ('SERVICE','Service (หลายลูกค้า)'),
  ('UCT-AUTO','UCT'), ('UCT-D3','UCT'), ('UCT-DUAL','UCT'), ('UCT-DBL2','UCT'), ('UCT','UCT'),
  ('HAM-500','Ham-Let'), ('HAM-300','Ham-Let'), ('HAM','Ham-Let'),
  ('SMT-5270','SMT'), ('SMT-4270','SMT'), ('SMT','SMT'),
  ('MMSB-L2','MMSB'), ('MMSB-L3','MMSB'), ('MJ','MJ'), ('KESSEL','Kessel'), ('GROW','Grow Ecovillage Khaoyai')
) as c(code, customer)
where mp_projects.code = c.code and (mp_projects.customer is null or mp_projects.customer = '');

-- imported rows only (source = 'sheet'); rows entered in the app keep the type that was picked
update public.mp_assignments set work_type = case
    when project_code = 'SERVICE' or text ~* '(^|[^a-z])(so|wr|pm)([^a-z]|$)|service|ซ่อม|เช็ค|ตรวจ' then 'service'
    when text ~* 'ติดตั้ง|install|ins\.|รื้อ|dismantle|(^|[^a-z])sat([^a-z]|$)|commission|ทดสอบ|test run|หน้างาน|site' then 'install'
    when text ~* 'ประกอบ|assembly|assy|electrical|ไฟฟ้า|ตู้|wiring|piping|เดินท่อ|pack|แพ็ค' then 'assembly'
    when text ~* 'fab|เตรียม|ขึ้นรูป|เชื่อม|ตัด|พับ|ม้วน|เจาะ|cover|duct|tank|ถัง' then 'fab'
    else 'other' end
where source = 'sheet';
