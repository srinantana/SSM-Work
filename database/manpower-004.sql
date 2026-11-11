-- SSM Work · Manpower migration 004 (11 Nov 2026) — short job name for the Planning Board.
-- Board cells show "work type | customer | short name"; the full name, Job no. and details open on click.
-- Fill short names in วางแผนกำลังคน → ข้อมูลหลัก → งาน / ลูกค้า (or import Dew's master project table).
-- Until a job has a short name the board falls back to its full name. Safe to run again.
alter table public.mp_projects add column if not exists short_name text;
