-- SSM Work · QA Tools — internal verification of calibration results by the QA Engineer (form FM-QA-10 บันทึกผลการทวนสอบเครื่องมือวัด).
-- Run once in Supabase → SQL Editor (safe to run again). Flow: sent → result → pending_verify → ทวนสอบ → pending_approval → approved.
-- verify = { no, date, ref_cert, criteria, points: [{pt, err, unc, mpe, ok}], note, protect, by, name, position, at }
alter table public.qa_tool_cals add column if not exists verify jsonb;
