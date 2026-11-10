#!/usr/bin/env python3
"""SSM Work · Manpower — one-time import of the old Google Sheet "26 (PD)- ตารางงานและวันหยุดช่าง 2569".

Input : a text export of the whole spreadsheet (one "## Sheet name: <tab>" header per tab, followed by the tab as CSV).
Output: <out>.sql        — INSERT statements for the tables in database/manpower.sql (run once in Supabase SQL Editor)
        <out>-review.csv — every distinct cell text with the project / kind it was mapped to, for checking by hand

Sources (decided with Dew, 10 Nov 2026 — import everything from 1 Jan 2026):
  * 1 Jan – 30 Apr 2026 : tab "ตารางงาน+วันหยุด 2569"  (old layout: one row per person + unnamed sub-rows under it)
  * 1 May 2026 onward   : tab "แผนช่าง"                 (new layout: one row per person, project milestone rows on top)
Workers who are not in "แผนช่าง" any more, and ปอนด์ (resigned), are imported as inactive so their history stays.

The script itself holds no company data; the export file and the generated SQL must not be committed (public repo).

Usage: python3 -I scripts/manpower-import.py <export.txt> <out-prefix>
"""
import csv
import datetime as dt
import io
import re
import sys
from collections import Counter, defaultdict

START = dt.date(2026, 1, 1)
SWITCH = dt.date(2026, 5, 1)          # first day taken from แผนช่าง
OLD_TAB, NEW_TAB, EMP_TAB = "ตารางงาน+วันหยุด 2569", "แผนช่าง", "ช่าง"
RESIGNED = {"ณรงค์ฤทธิ์ อินทร์รอด"}   # ปอนด์ — left the company
WD = {"จันทร์": 0, "อังคาร": 1, "พุธ": 2, "พฤหัส": 3, "ศุกร์": 4, "เสาร์": 5, "อาทิตย์": 6}

# ---------- projects (first match wins; texts are lower-cased, whitespace collapsed, "จอง" removed) ----------
PROJECTS = [  # code, name, status, colour, regex
    ("PANDORA-AAA", "Pandora AAA", "cancelled", "#9aa1ab", r"pandora\s*aaa"),
    ("DAISIN", "Daisin Anodize Line", "active", "#7a4fd0", r"daisin|dissin|ไดซิน"),
    ("SERVICE", "Service (SO / WR / งานบริการลูกค้า)", "active", "#2f6fd6",
     r"(^|[\s/(])(so|wr)([\s/)+]|$)|endo|alpha|\bbot\b|\btsm\b|\benc\b|\beta\b|ckc|jgi|aluma|alumet|kpv|kimchi|riken|hoover|summit|q-con|"
     r"film\s*master|precious|\bepe\b|mattel\(b\)|roden|suzuki|air inter|senior|เยาวราช|yamato|sunparadise|my coating|c\.h\.|tsla"),
    ("UCT-AUTO", "UCT Auto line", "postponed", "#8a6d3b", r"uct.*auto\s*line"),
    ("UCT-D3", "UCT Double #3", "active", "#c70404", r"uct.*(double\s*#?\s*3\b|double\s*(line|system)\s*[345]\b|line\s*3)"),
    ("UCT-DUAL", "UCT Dual line 1 system", "active", "#e0671b", r"uct[\s-]*dual(?!\s*\+)"),
    ("UCT-DBL2", "UCT Double line 2 system", "active", "#d23f6c", r"uct[\s-]*double(?!.*dual)"),
    ("UCT", "UCT (ไม่ระบุไลน์)", "active", "#f08a7a", r"uct"),
    ("HAM-500", "Ham-let Double soak 500L", "active", "#0f8b8d", r"ham-?\s*let.*500(?!\s*,)"),
    ("HAM-300", "Ham-let Double soak 300L", "active", "#22a39f", r"ham-?\s*let.*300"),
    ("HAM", "Ham-let (ไม่ระบุ 300/500)", "active", "#6cc7c1", r"ham-?\s*let"),
    ("SMT-5270", "SMT 5270 Revamp / Re-layout", "active", "#188764", r"5270|renovate\s*smt"),
    ("SMT-4270", "SMT Modify 4270", "hold", "#5c9e6e", r"4270"),
    ("SMT", "SMT (อื่นๆ)", "active", "#8cc49a", r"smt"),
    ("MMSB-L2", "MMSB Line 2", "active", "#5b4ab8", r"(mmsb|mssb|mattle).*line\s*#?\s*2"),
    ("MMSB-L3", "MMSB Line 3", "active", "#3d3a8f", r"mmsb|mssb|mattle"),
    ("MJ", "MJ", "active", "#b8860b", r"(^|[^a-z])mj([^a-z]|$)"),
    ("KESSEL", "Kessel", "active", "#7b5e3c", r"kessel"),
    ("GROW", "Grow Ecovillage Khaoyai", "active", "#4c9a2a", r"grow|โกรอีโค"),
    ("PANDORA", "Pandora", "active", "#1e5aa8", r"pandora"),
]
PROJECTS_RE = [(c, re.compile(rx)) for c, _, _, _, rx in PROJECTS]
# Milestone rows on top of แผนช่าง → project code
MILESTONE_ROWS = {
    "grow": "GROW", "kessel": "KESSEL", "pandota aaa": "PANDORA-AAA", "smt modify 4270": "SMT-4270", "so": "SERVICE",
    "mj": "MJ", "mmsb line3": "MMSB-L3", "mmsb line2": "MMSB-L2", "uct-auto line": "UCT-AUTO",
    "uct-dual line 1 system": "UCT-DUAL", "uct-double line 2 system": "UCT-DBL2",
    "hamlet-double soak (500l) 2 system": "HAM-500", "hamlet-double soak (300l) 2 system": "HAM-300",
    "smt 5270 revamp": "SMT-5270", "uct double #3": "UCT-D3",
}

ABSENCE = {  # exact cell text → absence type
    "H": "H", "PH": "PH", "EX": "EX", "พักร้อน": "พักร้อน", "ลาป่วย": "ลาป่วย", "ลาป่วยครึ่งวัน": "ลาป่วยครึ่งวัน",
    "ลากิจ": "ลากิจ", "ลาไม่รับค่าจ้าง": "ลาไม่รับค่าจ้าง", "ลา": "ลา", "ลากลับบ้าน": "ลา", "กลับบ้าน": "ลา",
    "สลับวันหยุด": "สลับวันหยุด", "สลับหยุด": "สลับวันหยุด", "ลาหยุด": "ลา",
}
ADMIN_RE = re.compile(r"ประชุม|meeting|kick-?off|_kom|อบรม|ojt|training|ตรวจสุขภาพ|passport|พาสปอต|หนังสือเดินทาง|visa|เคลียร์|"
                      r"ทำแผน|report|สัมภาษณ์|list คืนของ|คืนของ|เช็คของ|ตามงานผลิต|ทำ bom|site survey", re.I)
SO_RE = re.compile(r"(^|[\s/(])so([\s/)+]|$)")
INTERNAL_RE = re.compile(r"ไร่|ตัดต้นไม้|^pd\b|facility|ซ่อมบำรุง|stock|sbbox|transfer ของ", re.I)


def norm(s):
    return " ".join(str(s or "").split())


def classify(raw):
    """→ (kind, project_code|None, tentative, absence_type|None)"""
    t = norm(raw)
    if t in ABSENCE:
        return "absence", None, False, ABSENCE[t]
    tentative = t.startswith("จอง")
    body = re.sub(r"^จอง\s*", "", t)
    low = body.lower()
    if ADMIN_RE.search(low) and not SO_RE.search(low):
        # meetings about a project stay on that project only when the text is clearly project work
        return "admin", project_of(low), tentative, None
    if INTERNAL_RE.search(low) and not SO_RE.search(low):
        return "internal", None, tentative, None
    p = project_of(low)
    return ("work" if p else "other"), p, tentative, None


def project_of(low):
    for code, rx in PROJECTS_RE:
        if rx.search(low):
            return code
    return None


# ---------- read the export ----------
def read_tabs(path):
    tabs, name, buf = {}, None, []
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^## Sheet name: (.*)$", line.rstrip("\n"))
        if m:
            if name is not None:
                tabs[name] = list(csv.reader(io.StringIO("".join(buf))))
            name, buf = m.group(1).strip(), []
        else:
            buf.append(line)
    if name is not None:
        tabs[name] = list(csv.reader(io.StringIO("".join(buf))))
    return tabs


def check_dates(header, first_col, first_day):
    for j in range(first_col, len(header)):
        d = first_day + dt.timedelta(j - first_col)
        p = header[j].split()
        if len(p) != 2 or WD.get(p[0]) != d.weekday() or int(p[1]) != d.day:
            raise SystemExit(f"date header mismatch at column {j}: {header[j]!r} ≠ {d}")


def clean_name(s):
    s = str(s or "").split("\n")[0]
    s = re.sub(r"[\(\[].*?[\)\]]", "", s)
    return norm(s)


def main(src, out):
    tabs = read_tabs(src)
    new, old, emp = tabs[NEW_TAB], tabs[OLD_TAB], tabs.get(EMP_TAB, [])

    # employee codes by Thai full name (tab ช่าง)
    codes = {}
    for r in emp[1:]:
        if len(r) > 2 and r[0].strip():
            codes[norm(r[1])] = (r[0].strip(), norm(r[6]) if len(r) > 6 else "")

    # ----- workers from แผนช่าง -----
    hi = next(i for i, r in enumerate(new) if r and r[0].strip() == "ลำดับ")
    check_dates(new[hi], 6, START)
    workers, by_name, sort = [], {}, 0
    def add_worker(name, nick, unit, trade, active):
        nonlocal sort
        sort += 10
        code, nick2 = codes.get(name, ("", ""))
        wid = code or "X%03d" % sort
        w = {"id": wid, "emp_code": code, "name_th": name, "nickname": nick or nick2, "unit": unit, "trade": trade,
             "active": active and name not in RESIGNED, "sort": sort}
        workers.append(w)
        by_name[name] = w
        return w
    new_rows = []
    for r in new[hi + 1:]:
        if len(r) > 4 and r[1].strip() and r[4].strip() in ("ME", "PP", "EE", "PC", "SC"):
            w = add_worker(clean_name(r[1]), norm(r[2]), r[4].strip(), norm(r[3]), True)
            new_rows.append((w, r))

    # ----- old tab: person rows + unnamed sub-rows; Jan–Apr only -----
    ohi = next(i for i, r in enumerate(old) if r and r[0].strip() == "ลำดับ")
    check_dates(old[ohi], 14, START)
    UNIT = {"กลโลหะ": "ME", "พลาสติก": "PP", "ไฟฟ้า": "EE", "PC": "PC", "SC": "SC"}
    NICK = {"ดิว": "นันทนา ศรีสกุลเตียว", "อาร์ท": "ศักดิ์กมล จันทริมา", "หนุ่ม": "ธีร์ดนัย ฮุยสูงเนิน", "ปาย": "ประกายแก้ว ปัญญา",
            "ปอนด์": "ณรงค์ฤทธิ์ อินทร์รอด", "แพร": "ภัทรลดา ทองสอาด", "พี่ดล": "ธนดล พิมพ์พิทัก"}
    old_people, cur = [], None
    for r in old[ohi + 1:]:
        if len(r) < 5:
            continue
        name = clean_name(r[1])
        if name and (norm(r[2]) or name in NICK):
            name = NICK.get(name, name)
            w = by_name.get(name)
            if not w:
                unit = UNIT.get(norm(r[2]).split(" ")[0], "ME")
                w = add_worker(name, "", unit, norm(" ".join(norm(r[2]).split(" ")[1:])), False)
            cur = [w, [r]]
            old_people.append(cur)
        elif cur and not name and any(c.strip() for c in r[14:]):
            cur[1].append(r)            # sub-row: extra text for the same person

    cells = {}  # (worker_id, date) → raw text
    for w, rs in old_people:
        for j in range(14, 14 + (SWITCH - START).days):
            parts = [norm(r[j]) for r in rs if j < len(r) and norm(r[j])]
            if parts:
                cells[(w["id"], START + dt.timedelta(j - 14))] = " / ".join(dict.fromkeys(parts))
    for w, r in new_rows:
        for j in range(6, len(r)):
            d = START + dt.timedelta(j - 6)
            if d >= SWITCH and norm(r[j]):
                cells[(w["id"], d)] = norm(r[j])

    # ----- milestones from the rows above the header in แผนช่าง -----
    milestones = []
    for r in new:
        code = MILESTONE_ROWS.get(norm(r[1]).lower()) if len(r) > 1 else None
        if not code:
            continue
        for j in range(6, len(r)):
            t = norm(r[j])
            if t and t not in ("H", "PH") and not re.fullmatch(r"[A-Z]{2}\d+:[A-Z]{2}\d+", t):
                milestones.append((code, START + dt.timedelta(j - 6), t))
    status_note = {}
    for r in new:
        code = MILESTONE_ROWS.get(norm(r[1]).lower()) if len(r) > 3 else None
        if code and norm(r[3]):
            status_note[code] = norm(r[3])

    # ----- classify -----
    assignments, absences, review = [], [], Counter()
    review_map = {}
    for (wid, d), raw in sorted(cells.items(), key=lambda x: (x[0][1], x[0][0])):
        kind, proj, tent, ab = classify(raw)
        review[raw] += 1
        review_map[raw] = (kind, proj or ab or "", tent)
        if kind == "absence":
            absences.append((wid, d, ab))
        else:
            assignments.append((wid, d, proj, kind, raw, tent))

    # company holidays: PH / EX marked for most people on the same day
    per_day = defaultdict(Counter)
    for wid, d, ab in absences:
        per_day[d][ab] += 1
    active_n = sum(1 for w in workers if w["active"])
    holidays = sorted((d, t) for d, c in per_day.items() for t, n in c.items() if t in ("PH", "EX") and n >= active_n * 0.5)

    write_sql(out + ".sql", workers, milestones, status_note, assignments, absences, holidays)
    with open(out + "-review.csv", "w", encoding="utf-8-sig", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["ข้อความในชีต", "จำนวนช่อง", "ประเภท", "โปรเจกต์ / ประเภทการลา", "จอง (tentative)"])
        for raw, n in sorted(review.items(), key=lambda x: (x[1] and review_map[x[0]][0], -x[1])):
            k, p, t = review_map[raw]
            wr.writerow([raw, n, k, p, "Y" if t else ""])
    kinds = Counter(a[3] for a in assignments)
    print(f"workers {len(workers)} (active {active_n}) · assignments {len(assignments)} {dict(kinds)} · absences {len(absences)} · "
          f"milestones {len(milestones)} · company holidays {len(holidays)} · distinct texts {len(review)}")
    left = [w for w in workers if not w["active"]]
    print("inactive:", ", ".join(w["name_th"] for w in left))
    future = [a for a in assignments if a[0] in {w['id'] for w in workers if w['name_th'] in RESIGNED} and a[1] >= dt.date.today()]
    print("future work booked for resigned staff:", len(future))


def q(v):
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_sql(path, workers, milestones, status_note, assignments, absences, holidays):
    L = ["-- SSM Work · Manpower seed (generated by scripts/manpower-import.py). Run once AFTER database/manpower.sql.",
         "-- Contains staff names and leave records: keep it out of git.", "begin;",
         "truncate public.mp_assignments, public.mp_absences, public.mp_milestones, public.mp_holidays restart identity;"]
    L.append("insert into public.mp_projects (code, name, status, color, sort, note) values")
    L.append(",\n".join(f"({q(c)},{q(n)},{q(s)},{q(col)},{i * 10},{q(status_note.get(c))})"
                        for i, (c, n, s, col, _) in enumerate(PROJECTS, 1)))
    L.append("on conflict (code) do update set name=excluded.name, status=excluded.status, color=excluded.color, sort=excluded.sort, note=excluded.note;")
    L.append("insert into public.mp_workers (id, emp_code, name_th, nickname, unit, trade, active, sort) values")
    L.append(",\n".join(f"({q(w['id'])},{q(w['emp_code'])},{q(w['name_th'])},{q(w['nickname'])},{q(w['unit'])},{q(w['trade'])},{q(w['active'])},{w['sort']})" for w in workers))
    L.append("on conflict (id) do update set emp_code=excluded.emp_code, name_th=excluded.name_th, nickname=excluded.nickname, unit=excluded.unit, trade=excluded.trade, active=excluded.active, sort=excluded.sort;")
    if holidays:
        L.append("insert into public.mp_holidays (day, type) values " + ",".join(f"({q(str(d))},{q(t)})" for d, t in holidays) + ";")
    if milestones:
        L.append("insert into public.mp_milestones (project_code, day, label) values")
        L.append(",\n".join(f"({q(c)},{q(str(d))},{q(t)})" for c, d, t in milestones) + ";")
    for i in range(0, len(absences), 2000):
        chunk = absences[i:i + 2000]
        L.append("insert into public.mp_absences (worker_id, day, type) values")
        L.append(",\n".join(f"({q(w)},{q(str(d))},{q(t)})" for w, d, t in chunk) + ";")
    for i in range(0, len(assignments), 2000):
        chunk = assignments[i:i + 2000]
        L.append("insert into public.mp_assignments (worker_id, day, project_code, kind, text, tentative, source) values")
        L.append(",\n".join(f"({q(w)},{q(str(d))},{q(p)},{q(k)},{q(t)},{q(tn)},'sheet')" for w, d, p, k, t, tn in chunk) + ";")
    L.append("commit;")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
