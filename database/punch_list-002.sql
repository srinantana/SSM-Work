-- SSM Work · Punch List — Remark (13 Nov 2026)
-- "remark" = important message to the customer (shown in the customer PDF / Excel).
-- "assignee" and "note" stay internal (no longer sent to the customer). Safe to run again.
alter table public.punch_list_items add column if not exists remark text not null default '';
