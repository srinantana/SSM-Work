-- SSM Work · QA Tools — history per calibration record (บันทึกผล / แก้ไข / ทวนสอบ / อนุมัติ). Run once in Supabase → SQL Editor (safe to run again).
alter table public.qa_tool_log add column if not exists cal_id bigint references public.qa_tool_cals(id) on delete set null;
create index if not exists qa_tool_log_cal on public.qa_tool_log (cal_id, at) where cal_id is not null;
