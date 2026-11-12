#!/usr/bin/env python3
"""Manpower milestones from the RAK Master Gantt export (rak-project-command-center → Export Excel).

Reads sheet "Summary" (Project No., Project, Customer, FAT date(s), Installation start, SAT date(s))
and writes one SQL file for Dew to run in the Supabase SQL editor:

  * a project row in mp_projects for each Job no. that has none yet (code = Job no.;
    name / customer from RAK_Master _Project_on_hand when the Job no. is there, else from the Gantt)
  * milestones FAT / INST / SAT on the board for that project.
    FAT / INST / SAT already on those projects are replaced, so the file can be re-run after each new export.
    Other milestones (labels you typed yourself) are left alone.

Usage:  python3 scripts/gantt-milestones.py RAK_Master_Gantt_2026-11-11.xlsx  > gantt-milestones.sql
"""
import datetime as dt
import re
import sys

import openpyxl

LABELS = ("FAT", "INST", "SAT")


def days(v):
    """A cell may hold a date, or text with one or more dates ("2026-10-30, 2026-11-02")."""
    if v is None or v == "":
        return []
    if isinstance(v, (dt.datetime, dt.date)):
        return [v.strftime("%Y-%m-%d")]
    return re.findall(r"\d{4}-\d{2}-\d{2}", str(v))


def q(s):
    return "null" if s is None or s == "" else "'" + str(s).replace("'", "''") + "'"


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True)["Summary"]
    rows = list(ws.iter_rows(values_only=True))
    head = next(i for i, r in enumerate(rows) if r and r[0] == "Project No.")
    col = {str(c).strip(): i for i, c in enumerate(rows[head]) if c}
    need = ["Project No.", "Project", "Customer", "FAT date(s)", "Installation start", "SAT date(s)"]
    miss = [n for n in need if n not in col]
    if miss:
        sys.exit("Summary sheet is missing columns: " + ", ".join(miss))
    jobs, ms = [], []
    for r in rows[head + 1:]:
        jn = str(r[col["Project No."]] or "").strip()
        if not jn:
            continue
        jobs.append((jn, r[col["Project"]], r[col["Customer"]]))
        for label, c in (("FAT", "FAT date(s)"), ("INST", "Installation start"), ("SAT", "SAT date(s)")):
            for d in days(r[col[c]]):
                ms.append((jn, d, label))
    out = [f"-- Manpower milestones from {path.split('/')[-1]} · {len(jobs)} jobs · {len(ms)} milestones (FAT / INST / SAT)",
           "-- Safe to re-run: replaces FAT / INST / SAT of these jobs only.", "begin;", "",
           "create temp table g_jobs (job_no text, name text, customer text) on commit drop;",
           "insert into g_jobs values"]
    out.append(",\n".join(f"  ({q(j)}, {q(n)}, {q(c)})" for j, n, c in jobs) + ";")
    out += ["create temp table g_ms (job_no text, day date, label text) on commit drop;", "insert into g_ms values"]
    out.append(",\n".join(f"  ({q(j)}, {q(d)}, {q(l)})" for j, d, l in ms) + ";")
    out += ["",
            "-- 1. a project for each Job no. not in the plan yet (name / customer from the master table when found)",
            "insert into public.mp_projects (code, name, customer, job_no, status)",
            "select g.job_no, coalesce(nullif(m.\"Job_Full_name\", ''), nullif(m.\"Job_name\", ''), g.name),",
            "       coalesce(nullif(m.\"Customer_Name\", ''), g.customer), g.job_no, 'active'",
            "from g_jobs g",
            "left join public.\"RAK_Master _Project_on_hand\" m on regexp_replace(m.\"Job_no\", '[^0-9A-Za-z]', '', 'g') = regexp_replace(g.job_no, '[^0-9A-Za-z]', '', 'g')",
            "where not exists (select 1 from public.mp_projects p where regexp_replace(coalesce(p.job_no, ''), '[^0-9A-Za-z]', '', 'g') = regexp_replace(g.job_no, '[^0-9A-Za-z]', '', 'g'))",
            "  and not exists (select 1 from public.mp_projects p where p.code = g.job_no);",
            "",
            "-- the project each Job no. maps to (first one if several share it)",
            "create temp table g_map on commit drop as",
            "select distinct on (g.job_no) g.job_no, p.code from g_jobs g",
            "join public.mp_projects p on regexp_replace(coalesce(p.job_no, ''), '[^0-9A-Za-z]', '', 'g') = regexp_replace(g.job_no, '[^0-9A-Za-z]', '', 'g') or p.code = g.job_no",
            "order by g.job_no, (p.code = g.job_no) asc, p.code;   -- prefer the plan's own project over one this script created",
            "",
            "-- 2. replace FAT / INST / SAT of these projects",
            "delete from public.mp_milestones where label in ('FAT', 'INST', 'SAT') and project_code in (select code from g_map);",
            "insert into public.mp_milestones (project_code, day, label)",
            "select distinct mp.code, s.day, s.label from g_ms s join g_map mp using (job_no);",
            "",
            "select (select count(*) from g_map) as jobs_mapped, (select count(*) from g_ms) as milestones_in_file,",
            "       (select count(*) from public.mp_milestones where label in ('FAT', 'INST', 'SAT') and project_code in (select code from g_map)) as milestones_now;",
            "commit;"]
    print("\n".join(out))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
