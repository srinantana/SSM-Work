/* SSM Work · Manpower module (วางแผนกำลังคน) — Planning Board: people × days, replacing the Google Sheet
   "26 (PD)- ตารางงานและวันหยุดช่าง 2569" (tab แผนช่าง). Phase 1 = view only; editing (SC / PC / SSM) comes in Phase 2.
   Routes (inside the hub): #manpower                         → month view around today
                            #manpower/<zoom>/<yyyy-mm-dd>     → zoom = week | month | quarter
   Data:  GET /api/manpower/board?from=&to=  → workers, projects, milestones, assignments, absences, holidays, canEdit */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const UNITS = [["ME", "ME · งานโลหะ"], ["PP", "PP · งานพลาสติก"], ["EE", "EE · ไฟฟ้า"], ["PC", "PC · วางแผนผลิต"], ["SC", "SC / SSM"]];
  const ZOOMS = [["week", "สัปดาห์"], ["month", "เดือน"], ["quarter", "3 เดือน"]];
  const MF = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];   // by Date.getDay()
  const ABS = { // absence type → [short label, css class, long label]
    H: ["H", "off", "วันหยุด"], PH: ["PH", "ph", "วันหยุดนักขัตฤกษ์"], EX: ["EX", "ph", "วันหยุดพิเศษบริษัท"],
    "พักร้อน": ["พักร้อน", "lv", "ลาพักร้อน"], "ลาป่วย": ["ป่วย", "lv", "ลาป่วย"], "ลาป่วยครึ่งวัน": ["ป่วย½", "lv", "ลาป่วยครึ่งวัน"],
    "ลากิจ": ["กิจ", "lv", "ลากิจ"], "ลาไม่รับค่าจ้าง": ["ไม่รับ", "lv", "ลาไม่รับค่าจ้าง"], "ลา": ["ลา", "lv", "ลา"],
    "สลับวันหยุด": ["สลับ", "off", "สลับวันหยุด"],
  };
  const KIND = { admin: ["#6d7582", "ประชุม / อบรม / ธุรการ"], internal: ["#9a7b4f", "งานภายใน"], other: ["#b3b8c2", "อื่นๆ (ตรวจสอบ)"] };

  let ROOT = null, DATA = null, LOADING = null, ERR = "", CUR = { W: [] };
  const S = { page: "board", zoom: "month", date: new Date(), units: new Set(UNITS.map(u => u[0])), cust: "", project: "", person: "", q: "", left: false, miles: true };
  const WT = [["fab", "Fab"], ["assembly", "Assembly"], ["install", "Install"], ["service", "Service"], ["other", "Other"]];
  const WTL = Object.fromEntries(WT);
  const LV = [["ลาป่วย", "ลาป่วย"], ["พักร้อน", "ลาพักร้อน"], ["ลากิจ", "ลากิจ"]];

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fromKey = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  function range() {
    const d = S.date;
    if (S.zoom === "week") { const a = addDays(d, -((d.getDay() + 6) % 7)); return [a, addDays(a, 13)]; }   // two weeks from Monday
    if (S.zoom === "quarter") { const a = new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % 3), 1); return [a, new Date(a.getFullYear(), a.getMonth() + 3, 0)]; }
    return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
  }
  function step(n) {
    const d = S.date;
    if (S.zoom === "week") return addDays(d, 14 * n);
    if (S.zoom === "quarter") return new Date(d.getFullYear(), d.getMonth() + 3 * n, 1);
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }
  function title() {
    const [a, b] = range();
    if (S.zoom === "month") return `${MF[a.getMonth()]} ${a.getFullYear()}`;
    if (S.zoom === "quarter") return `${MS[a.getMonth()]} – ${MS[b.getMonth()]} ${b.getFullYear()}`;
    return `${a.getDate()} ${MS[a.getMonth()]} – ${b.getDate()} ${MS[b.getMonth()]} ${b.getFullYear()}`;
  }
  const href = (zoom, d) => "#manpower/" + zoom + "/" + key(d);
  const MIN = new Date(2026, 0, 1), MAX = new Date(2027, 11, 31);   // planning calendar: 1 Jan 2026 – 31 Dec 2027
  const clampDate = d => d < MIN ? MIN : d > MAX ? MAX : d;

  /* ---------- load ---------- */
  async function load() {
    const [a, b] = range(), want = key(a) + "|" + key(b);
    if (DATA && DATA.want === want) return;
    ERR = "";
    try {
      const r = await fetch(`/api/manpower/board?from=${key(a)}&to=${key(b)}`, { cache: "no-store" });
      if (!r.ok) { ERR = r.status === 503 ? "ยังไม่ได้สร้างตารางข้อมูลกำลังคนใน Supabase (database/manpower.sql)" : r.status === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์เมนูวางแผนกำลังคน" : "โหลดข้อมูลไม่สำเร็จ (" + r.status + ")"; DATA = null; return; }
      const d = await r.json();
      d.want = want;
      d.P = new Map(d.projects.map(p => [p.code, p]));
      d.A = new Map(d.assignments.map(x => [x.worker_id + "|" + x.day, x]));
      d.X = new Map(d.absences.map(x => [x.worker_id + "|" + x.day, x]));
      d.H = new Map(d.holidays.map(x => [x.day, x]));
      d.SV = new Map();
      (d.service || []).forEach(x => { const k = x.worker_id + "|" + x.day; if (!d.SV.has(k)) d.SV.set(k, []); d.SV.get(k).push(x); });
      d.busy = new Set(d.assignments.concat(d.absences.filter(x => !["H", "PH", "EX"].includes(x.type)), d.service || []).map(x => x.worker_id));
      DATA = d;
    } catch { ERR = "โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้า"; DATA = null; }
  }
  function ensure() { if (!LOADING) LOADING = load().finally(() => { LOADING = null; }); return LOADING; }

  /* ---------- helpers ---------- */
  const norm = s => String(s ?? "").toLowerCase().replace(/\s+/g, "");
  const colorOf = a => a.project_code && DATA.P.get(a.project_code) ? DATA.P.get(a.project_code).color : (KIND[a.kind] || KIND.other)[0];
  const projName = a => a.project_code && DATA.P.get(a.project_code) ? DATA.P.get(a.project_code).name : (KIND[a.kind] || KIND.other)[1];
  function days() { const [a, b] = range(), out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
  // Two-level job filter: customer first, then a job of that customer. Service Plan cells match by their customer name.
  const custOf = code => { const p = code && DATA.P.get(code); return p ? (p.customer || "") : ""; };
  const lc = x => String(x || "").toLowerCase().trim();
  const matchA = a => S.project ? a.project_code === S.project : S.cust ? lc(custOf(a.project_code)) === lc(S.cust) : true;
  const matchSv = list => S.project ? S.project === "SERVICE" || list.some(j => lc(j.job) === lc((DATA.P.get(S.project) || {}).job_no)) : S.cust ? list.some(j => lc(j.customer).includes(lc(S.cust)) || lc(S.cust).includes(lc(j.customer))) || lc(custOf("SERVICE")) === lc(S.cust) : true;
  const matchM = code => S.project ? code === S.project : S.cust ? lc(custOf(code)) === lc(S.cust) : true;
  function customers() {
    const set = new Map();
    DATA.projects.forEach(p => { if (p.customer) set.set(lc(p.customer), p.customer); });
    return [...set.values()].sort((a, b) => a.localeCompare(b, "th"));
  }
  function visibleWorkers() {
    const q = norm(S.q);
    const busyIn = new Set();
    if (S.cust || S.project) {
      DATA.assignments.forEach(a => { if (matchA(a)) busyIn.add(a.worker_id); });
      DATA.SV.forEach((v, k) => { if (matchSv(v)) busyIn.add(k.split("|")[0]); });
    }
    return DATA.workers.filter(w => S.units.has(w.unit) && (!S.person || w.id === S.person) && (!(S.cust || S.project) || busyIn.has(w.id) || w.id === S.person) && (w.active || (S.left && DATA.busy.has(w.id)) || w.id === S.person) && (!q || norm(w.name_th + w.nickname + w.trade).includes(q)
      || (DATA.assignments.some(a => a.worker_id === w.id && norm(a.text).includes(q)))));
  }
  const dayOff = (k, d) => DATA.H.has(k) || d.getDay() === 0;

  /* ---------- render ---------- */
  function toolbar() {
    const [a] = range();
    const zoom = ZOOMS.map(([z, t]) => `<a href="${href(z, S.date)}" class="${S.zoom === z ? "on" : ""}">${t}</a>`).join("");
    const units = UNITS.map(([u]) => `<label class="mp-chk"><input type="checkbox" data-unit="${u}" ${S.units.has(u) ? "checked" : ""}>${u}</label>`).join("");
    const custs = DATA ? customers().map(c => `<option value="${esc(c)}" ${lc(S.cust) === lc(c) ? "selected" : ""}>${esc(c)}</option>`).join("") : "";
    const projs = DATA ? DATA.projects.filter(p => !S.cust || lc(p.customer) === lc(S.cust)).map(p => `<option value="${esc(p.code)}" ${S.project === p.code ? "selected" : ""}>${esc(p.name)}${p.job_no ? " · " + esc(p.job_no) : ""}${p.status !== "active" ? " (" + esc(p.status) + ")" : ""}</option>`).join("") : "";
    const ppl = DATA ? UNITS.map(([u, l]) => `<optgroup label="${esc(l)}">${DATA.workers.filter(w => w.unit === u && (w.active || S.left)).map(w => `<option value="${esc(w.id)}" ${S.person === w.id ? "selected" : ""}>${esc(w.nickname || w.name_th)} · ${esc(w.name_th)}</option>`).join("")}</optgroup>`).join("") : "";
    const can = DATA && DATA.canEdit;
    return `<div class="mp-head">
      <div class="mp-title"><h2>วางแผนกำลังคน</h2>${DATA && DATA.canEdit ? `<nav class="mp-tabs"><a href="#manpower" class="${S.page === "board" ? "on" : ""}">Planning Board</a><a href="#manpower/data" class="${S.page === "data" ? "on" : ""}">ข้อมูลหลัก</a><a href="#manpower/log" class="${S.page === "log" ? "on" : ""}">ประวัติการแก้ไข</a></nav>` : ""}<span class="mp-badge ${can ? "ed" : ""}">${can ? "SC / PC / SSM · ลงงาน / แก้ไข / Confirm ได้" : "ดูอย่างเดียว"}</span></div>
      <div class="mp-nav">${range()[0] <= MIN ? `<span class="mp-btn off">‹</span>` : `<a class="mp-btn" href="${href(S.zoom, step(-1))}" aria-label="ก่อนหน้า">‹</a>`}<a class="mp-btn" href="${href(S.zoom, today())}">วันนี้</a>${range()[1] >= MAX ? `<span class="mp-btn off">›</span>` : `<a class="mp-btn" href="${href(S.zoom, step(1))}" aria-label="ถัดไป">›</a>`}<b>${esc(title())}</b><span class="mp-zoom">${zoom}</span></div>
      <div class="mp-filters">${units}
        <span class="mp-fl"><select id="mpCust" aria-label="1. ลูกค้า"><option value="">ลูกค้า: ทั้งหมด</option>${custs}</select><i>›</i><select id="mpProj" aria-label="2. ชื่องาน"><option value="">${S.cust ? "งานของ " + esc(S.cust) + ": ทั้งหมด" : "ชื่องาน: ทั้งหมด"}</option>${projs}</select></span>
        <select id="mpPerson" aria-label="ชื่อคน"><option value="">ชื่อคน: ทุกคน</option>${ppl}</select>
        <input id="mpQ" type="search" placeholder="ค้นหาชื่อ / งาน" value="${esc(S.q)}" aria-label="ค้นหา">
        ${S.cust || S.project || S.person || S.q ? `<button type="button" class="mp-clr" id="mpClr">ล้างตัวกรอง</button>` : ""}
        <label class="mp-chk"><input type="checkbox" id="mpLeft" ${S.left ? "checked" : ""}>แสดงคนที่ลาออก</label>
        <label class="mp-chk"><input type="checkbox" id="mpMiles" ${S.miles ? "checked" : ""}>Milestone</label></div>
    </div>`;
  }

  function grid() {
    const ds = days(), tk = key(today()), W = visibleWorkers();
    CUR = { W: W.filter(w => S.units.has(w.unit)).map(w => w.id) };
    const cls = "mp-z-" + S.zoom;
    // header rows: month band + day numbers
    let months = "", cur = -1, span = 0;
    const flush = () => { if (span) months += `<th class="mp-mon" colspan="${span}"><span>${MF[cur % 100]} ${Math.floor(cur / 100)}</span></th>`; };
    ds.forEach(d => { const m = d.getFullYear() * 100 + d.getMonth(); if (m !== cur) { flush(); cur = m; span = 0; } span++; });
    flush();
    const dayHead = ds.map(d => { const k = key(d), h = DATA.H.get(k); return `<th class="mp-d ${dayOff(k, d) ? "we" : ""} ${k === tk ? "td" : ""}" title="${esc(h ? (h.name || ABS[h.type]?.[2] || h.type) : "")}"><span>${DS[d.getDay()]}</span>${d.getDate()}</th>`; }).join("");
    // milestones
    let miles = "";
    if (S.miles && DATA.milestones.length) {
      const byP = new Map();
      DATA.milestones.forEach(m => { if (matchM(m.project_code)) { if (!byP.has(m.project_code)) byP.set(m.project_code, new Map()); const x = byP.get(m.project_code); x.set(m.day, (x.get(m.day) ? x.get(m.day) + " · " : "") + m.label); } });
      const rows = DATA.projects.filter(p => byP.has(p.code)).map(p => `<tr class="mp-ms"><th class="mp-name"><i style="background:${esc(p.color)}"></i>${esc(p.name)}${p.status !== "active" ? ` <em>${esc(p.status)}</em>` : ""}</th>${ds.map(d => { const t = byP.get(p.code).get(key(d)); return t ? `<td class="mp-c ms" style="--c:${esc(p.color)}" title="${esc(t)}"><span>◆ ${esc(t)}</span></td>` : `<td class="mp-c ${dayOff(key(d), d) ? "we" : ""}"></td>`; }).join("")}</tr>`).join("");
      if (rows) miles = `<tr class="mp-grp"><th class="mp-name">◆ Milestone โปรเจกต์</th><td colspan="${ds.length}"></td></tr>` + rows;
    }
    // people grouped by unit (CUR.W = on-screen order, used by drag-select)
    CUR.W = UNITS.flatMap(([u]) => W.filter(w => w.unit === u).map(w => w.id));
    let body = "";
    UNITS.forEach(([u, label]) => {
      const ws = W.filter(w => w.unit === u);
      if (!ws.length) return;
      body += `<tr class="mp-grp"><th class="mp-name">${esc(label)} <span>${ws.filter(w => w.active).length} คน</span></th><td colspan="${ds.length}"></td></tr>`;
      ws.forEach(w => {
        body += `<tr><th class="mp-name${w.active ? "" : " left"}" title="${esc(w.name_th)}${w.emp_code ? " · " + esc(w.emp_code) : ""}"><b>${esc(w.nickname || w.name_th)}</b><small>${esc(w.name_th)}${w.trade ? " · " + esc(w.trade) : ""}${w.active ? "" : " · ลาออก"}</small></th>`
          + ds.map(d => cell(w, d)).join("") + "</tr>";
      });
    });
    // daily summary
    const act = W.filter(w => w.active);
    const sum = (f, lab, c) => `<tr class="mp-sum ${c}"><th class="mp-name">${lab}</th>${ds.map(d => { const n = f(key(d), d); return `<td class="mp-c">${n || ""}</td>`; }).join("")}</tr>`;
    const working = (k) => act.filter(w => { const a = DATA.A.get(w.id + "|" + k), sv = DATA.SV.get(w.id + "|" + k); return (a && matchA(a)) || (sv && !a && matchSv(sv)); }).length;
    const leave = (k) => act.filter(w => { const x = DATA.X.get(w.id + "|" + k); return x && ABS[x.type] && ABS[x.type][1] === "lv"; }).length;
    const free = (k, d) => dayOff(k, d) ? 0 : act.filter(w => !DATA.A.has(w.id + "|" + k) && !DATA.X.has(w.id + "|" + k) && !DATA.SV.has(w.id + "|" + k)).length;
    const foot = sum(working, S.project || S.cust ? "คนในงานที่เลือก" : "มีงาน", "w") + sum(leave, "ลา", "l") + sum(free, "ว่าง (ยังไม่ลงงาน)", "f");
    if (!W.length) return `<div class="mp-empty">${S.cust || S.project ? "ไม่มีใครลงงานนี้ในช่วงที่เลือก ลองเปลี่ยนเดือนหรือซูม 3 เดือน" : "ไม่พบรายชื่อตามตัวกรอง"}</div>`;
    return `<div class="mp-scroll ${cls}"><table class="mp-grid"><thead><tr><th class="mp-name mp-corner" rowspan="2">ชื่อ</th>${months}</tr><tr>${dayHead}</tr></thead>
      <tbody>${miles}${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
  }

  const spText = j => [j.type, j.customer].filter(Boolean).join(" ") || j.job;
  const spColor = () => (DATA.P.get("SERVICE") || { color: "#2f6fd6" }).color;
  function cell(w, d) {
    const k = key(d), id = w.id + "|" + k, a = DATA.A.get(id), x = DATA.X.get(id), we = dayOff(k, d), sv = DATA.SV.get(id);
    const base = `mp-c${we ? " we" : ""}${k === key(today()) ? " td" : ""}`;
    // Service Plan (Confirm) next to a different plan for the same person/day → flag, never hide either one
    const clash = sv && ((a && a.project_code !== "SERVICE") || (x && ABS[x.type] && ABS[x.type][1] === "lv"));
    const flag = sv ? `<b class="mp-sp${clash ? " x" : ""}" title="${esc(clash ? "ชนกับงานจาก Service Plan: " : "Service Plan: ") + esc(sv.map(spText).join(", "))}">${clash ? "!" : "SP"}</b>` : "";
    // leave wins over planned work on the same day (work is kept and flagged)
    if (x && ABS[x.type] && ABS[x.type][1] === "lv") {
      const t = ABS[x.type], wf = a ? `<b class="mp-sp x" title="${esc("มีงานลงไว้: " + a.text)}">!</b>` : flag;
      return `<td class="${base} ab lv" data-k="${esc(id)}" title="${esc(t[2] + (x.note ? " · " + x.note : ""))}"><span>${esc(t[0])}</span>${wf}</td>`;
    }
    if (a && matchA(a)) {
      const c = colorOf(a);
      return `<td class="${base} job${a.tentative ? " tent" : ""}" style="--c:${esc(c)}" data-k="${esc(id)}" title="${esc(a.text)}"><span>${esc(a.text)}</span>${flag}</td>`;
    }
    if (sv && !a && !(x && ABS[x.type] && ABS[x.type][1] === "lv") && matchSv(sv)) {
      return `<td class="${base} job sv" style="--c:${esc(spColor())}" data-k="${esc(id)}" title="${esc(sv.map(spText).join(", "))}"><span>${esc(sv.map(spText).join(" / "))}</span>${flag}</td>`;
    }
    if (x && sv) { const t = ABS[x.type] || [x.type, "lv", x.type]; return `<td class="${base} ab ${t[1]}" data-k="${esc(id)}" title="${esc(t[2])}"><span>${esc(t[0])}</span>${flag}</td>`; }
    if (a) return `<td class="${base} dim" data-k="${esc(id)}" title="${esc(a.text)}"></td>`;
    const ed = DATA.canEdit ? ` data-k="${esc(id)}"` : "";
    if (x) { const t = ABS[x.type] || [x.type, "lv", x.type]; return `<td class="${base} ab ${t[1]}" data-k="${esc(id)}" title="${esc(t[2])}"><span>${esc(t[0])}</span></td>`; }
    return `<td class="${base}${DATA.canEdit ? " ed" : ""}"${ed}${DATA.canEdit ? ' title="กดเพื่อลงงาน"' : ""}></td>`;
  }

  function legend() {
    const n = new Map();
    DATA.assignments.forEach(a => { const c = a.project_code || "_" + a.kind; n.set(c, (n.get(c) || 0) + 1); });
    let spOnly = 0;
    DATA.SV.forEach((v, k) => { if (!DATA.A.has(k)) spOnly++; });
    if (spOnly) n.set("SERVICE", (n.get("SERVICE") || 0) + spOnly);
    const items = DATA.projects.filter(p => n.has(p.code)).sort((a, b) => n.get(b.code) - n.get(a.code))
      .map(p => `<button type="button" class="mp-lg ${S.project === p.code ? "on" : ""}" data-p="${esc(p.code)}"><i style="background:${esc(p.color)}"></i>${esc(p.name)} <b>${n.get(p.code)}</b></button>`)
      .concat(Object.keys(KIND).filter(k => n.has("_" + k)).map(k => `<span class="mp-lg"><i style="background:${KIND[k][0]}"></i>${KIND[k][1]} <b>${n.get("_" + k)}</b></span>`));
    const um = DATA.serviceUnmatched || [];
    const review = um.length && DATA.canEdit ? `<details class="mp-um"><summary>ชื่อใน Service Plan ที่จับคู่กับช่างไม่ได้ ${um.length} งาน</summary><ul>${um.map(j => `<li><b>${esc(j.job || "แถว " + j.row)}</b> ${esc(j.customer)} · ${esc(j.status)} — ${j.names.map(esc).join(", ")}</li>`).join("")}</ul><p>แก้ชื่อในใบขอคนให้ตรงกับชื่อจริงของช่าง (ถ้าชื่อซ้ำให้ใส่ต้นนามสกุล เช่น "สัญญา สม") แล้ว board จะอัปเดตเอง</p></details>` : "";
    return `<div class="mp-legend"><span class="mp-lt">Man-day ในช่วงนี้</span>${items.join("")}<span class="mp-lg"><i class="tent-i"></i>จอง (ยังไม่ยืนยัน)</span><span class="mp-lg"><b class="mp-sp in">SP</b>Confirm จาก Service Plan</span><span class="mp-lg"><b class="mp-sp x in">!</b>ชนกับ Service Plan</span><span class="mp-lg"><i class="lv-i"></i>ลา</span><span class="mp-lg"><i class="off-i"></i>H / PH วันหยุด</span></div>${review}`;
  }

  // Contiguous "จอง" run of the same text for one person (gaps of days off / blank Sundays allowed).
  function runOf(wid, day, text) {
    const days = [day];
    for (const dir of [-1, 1]) {
      let d = fromKey(day), gap = 0;
      while (gap < 3) {
        d = addDays(d, dir); const k = key(d), a = DATA.A.get(wid + "|" + k);
        if (k < DATA.from || k > DATA.to) break;
        if (a && a.tentative && a.text === text) { days.push(k); gap = 0; } else if (!a) gap++; else break;
      }
    }
    return days.sort();
  }
  function detail(k) {
    const [wid, day] = k.split("|"), w = DATA.workers.find(x => x.id === wid), a = DATA.A.get(k), x = DATA.X.get(k), sv = DATA.SV.get(k) || [], d = fromKey(day);
    let body = a ? `<dl class="mp-dl"><dt>งาน</dt><dd>${esc(a.text)}</dd><dt>โปรเจกต์</dt><dd><i class="mp-dot" style="background:${esc(colorOf(a))}"></i>${esc(projName(a))}</dd>${a.project_code && DATA.P.get(a.project_code) && DATA.P.get(a.project_code).customer ? `<dt>ลูกค้า</dt><dd>${esc(DATA.P.get(a.project_code).customer)}</dd>` : ""}${a.project_code && DATA.P.get(a.project_code) && DATA.P.get(a.project_code).job_no ? `<dt>Job no.</dt><dd>${esc(DATA.P.get(a.project_code).job_no)}</dd>` : ""}<dt>ประเภทงาน</dt><dd>${esc(WTL[a.work_type] || "—")}</dd><dt>สถานะ</dt><dd>${a.tentative ? "จอง (ยังไม่ยืนยัน)" : "ยืนยันแล้ว"}</dd></dl>`
      : x ? `<dl class="mp-dl"><dt>ประเภท</dt><dd>${esc((ABS[x.type] || [0, 0, x.type])[2])}</dd>${x.note ? `<dt>หมายเหตุ</dt><dd>${esc(x.note)}</dd>` : ""}</dl>` : "";
    if (a && x && ABS[x.type] && ABS[x.type][1] === "lv") body = `<dl class="mp-dl"><dt>วันลา</dt><dd>${esc(ABS[x.type][2])}${x.note ? " · " + esc(x.note) : ""}</dd><dt>งานที่ลงไว้</dt><dd>⚠ ${esc(a.text)}</dd></dl>`;
    let actions = "";
    if (a && a.tentative) {
      const run = runOf(wid, day, a.text), lo = run[0], hi = run[run.length - 1];
      const team = DATA.assignments.filter(y => y.tentative && y.text === a.text && y.day >= lo && y.day <= hi);
      const teamN = new Set(team.map(y => y.worker_id)).size;
      actions = DATA.canEdit ? `<div class="mp-act"><span>Confirm Manpower</span>
        <button type="button" class="mp-ok" data-scope="day">วันนี้</button>
        ${run.length > 1 ? `<button type="button" class="mp-ok" data-scope="run">ทั้งช่วงของคนนี้ (${run.length} วัน)</button>` : ""}
        ${teamN > 1 ? `<button type="button" class="mp-ok" data-scope="team">ทั้งทีม (${teamN} คน · ${team.length} ช่อง)</button>` : ""}
        <small>${esc(fromKey(lo).getDate() + " " + MS[fromKey(lo).getMonth()])} – ${esc(fromKey(hi).getDate() + " " + MS[fromKey(hi).getMonth()])} · คำว่า "จอง" จะถูกตัดออก</small></div>`
        : `<p class="mp-ro">ยืนยันได้เฉพาะ SC / PC / SSM</p>`;
      actions += `<script type="application/json" class="mp-run">${JSON.stringify({ text: a.text, run, team: team.map(y => [y.worker_id, y.day]) }).replace(/</g, "\\u003c")}</script>`;
    }
    if (sv.length) body += `<div class="mp-svd"><h4><b class="mp-sp in">SP</b> Confirm จาก Service Plan</h4>${sv.map(j => `<dl class="mp-dl"><dt>Job no.</dt><dd>${esc(j.job)} · ${esc(j.type)}</dd><dt>ลูกค้า</dt><dd>${esc(j.customer)}</dd><dt>งาน</dt><dd>${esc(j.desc.split("\n")[0])}</dd><dt>สถานะ</dt><dd>${esc(j.status)}</dd></dl>`).join("")}<p class="mp-ro">ข้อมูลมาจากใบขอคนอัตโนมัติ แก้ที่ Service Plan / ใบขอคน${(a && a.project_code !== "SERVICE") ? " · ⚠ วันนี้มีงานอื่นลงไว้แล้ว ตรวจสอบว่าคนนี้ไปงานไหน" : ""}</p></div>`;
    const form = DATA.canEdit ? editForms({ ids: [wid], from: day, to: day, a, x }) : "";
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="รายละเอียด"><header><div><b>${esc(w ? (w.nickname || w.name_th) : wid)}</b> <span>${esc(w ? w.name_th : "")}</span><div class="mp-when">${DS[d.getDay()]}. ${d.getDate()} ${MF[d.getMonth()]} ${d.getFullYear()}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${body}${actions}${form}<div class="mp-msg" role="status"></div></div>`;
    if (DATA.canEdit) wireForms(el, { ids: [wid], from: day, to: day }, () => close());
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", async e => {
      if (e.target === el || e.target.closest(".mp-x")) return close();
      const b = e.target.closest(".mp-ok"); if (!b) return;
      const info = JSON.parse(el.querySelector(".mp-run").textContent), scope = b.dataset.scope;
      const cells = scope === "day" ? [[wid, day]] : scope === "run" ? info.run.map(dd => [wid, dd]) : info.team;
      const by = new Map(); cells.forEach(([w2, d2]) => { if (!by.has(w2)) by.set(w2, []); by.get(w2).push(d2); });
      el.querySelectorAll(".mp-ok").forEach(x => { x.disabled = true; });
      const msg = el.querySelector(".mp-msg"); msg.textContent = "กำลังบันทึก…";
      try {
        const r = await fetch("/api/manpower/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: info.text, items: [...by].map(([worker_id, days]) => ({ worker_id, days })) }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || r.status);
        cells.forEach(([w2, d2]) => { const y = DATA.A.get(w2 + "|" + d2); if (y && y.tentative && y.text === info.text) { y.tentative = false; y.text = res.text; } });
        msg.textContent = `ยืนยันแล้ว ${res.confirmed} ช่อง`;
        draw(); setTimeout(close, 700);
      } catch (err) { msg.textContent = "บันทึกไม่สำเร็จ (" + err.message + ")"; el.querySelectorAll(".mp-ok").forEach(x => { x.disabled = false; }); }
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    el.querySelector(".mp-x").focus();
  }


  /* ---------- add / edit forms (SC / PC / SSM) — one cell, or a block dragged on the grid ---------- */
  const fmtD = k => { const d = fromKey(k); return d.getDate() + " " + MS[d.getMonth()] + " " + String(d.getFullYear()).slice(2); };
  function picker(ids) {
    const sel = new Set(ids);
    return `<details class="mp-pick"><summary>คนที่จะลง: <b class="mp-pn">${sel.size}</b> คน · เพิ่ม / เอาออก</summary><div class="mp-pl">${UNITS.map(([u, l]) => {
      const ws = DATA.workers.filter(w => w.unit === u && (w.active || sel.has(w.id)));
      return ws.length ? `<fieldset><legend>${esc(l)}</legend>${ws.map(w => `<label><input type="checkbox" name="who" value="${esc(w.id)}" ${sel.has(w.id) ? "checked" : ""}>${esc(w.nickname || w.name_th)}</label>`).join("")}</fieldset>` : "";
    }).join("")}</div></details>`;
  }
  function editForms({ ids, from, to, a, x, bulk }) {
    const pj = a && a.project_code ? DATA.P.get(a.project_code) : null;
    const cust = pj ? pj.customer || "" : (S.cust || ""), job = pj ? pj.name : "", jno = pj ? pj.job_no || "" : "";
    const wt = a ? (a.work_type || "other") : "";
    const note = a && pj && a.text !== pj.name ? a.text.replace(/^จอง\s*/, "") : (a && !pj ? a.text : "");
    const isLv = x && ABS[x.type] && ABS[x.type][1] === "lv";
    const toField = `<label>ถึงวันที่<input type="date" name="to" value="${esc(to)}" min="${esc(from)}" max="2027-12-31"></label>`;
    return `${picker(ids)}
      <details class="mp-fwrap" ${a || isLv ? "" : "open"}><summary>${a ? "แก้ไขงาน" : "ลงงาน"}</summary><form class="mp-form mp-wform" autocomplete="off">
        <label>ลูกค้า<input name="customer" list="mpCustL" value="${esc(cust)}" placeholder="เช่น UCT, Ham-Let, SMT" required></label>
        <label>ชื่องาน<input name="job" list="mpJobL" value="${esc(job)}" placeholder="เลือกงานเดิมหรือพิมพ์ชื่องานใหม่" required></label>
        <label>Job no.<input name="job_no" value="${esc(jno)}" placeholder="เช่น 04002026"></label>
        <fieldset><legend>ประเภทงาน</legend>${WT.map(([v, l]) => `<label class="mp-wt"><input type="radio" name="work_type" value="${v}" ${wt === v ? "checked" : ""} required>${l}</label>`).join("")}</fieldset>
        <label class="wide">รายละเอียด (ไม่บังคับ)<input name="note" value="${esc(note)}" placeholder="เช่น ประกอบถัง T-05, เดินสายตู้ MCC"></label>
        ${toField}
        <div class="mp-chks"><label><input type="checkbox" name="skip" checked> ข้ามวันอาทิตย์ / วันหยุด / วันลา</label><label><input type="checkbox" name="tentative" ${a && a.tentative ? "checked" : ""}> จอง (ยังไม่ยืนยัน)</label></div>
        <div class="mp-fbtn"><button type="submit" class="mp-save">บันทึก</button>${a || bulk ? `<button type="button" class="mp-del">${bulk ? "ลบงานทั้งหมดในช่องที่เลือก" : "ลบงานวันนี้"}</button>` : ""}</div>
        <datalist id="mpCustL">${customers().map(c => `<option value="${esc(c)}">`).join("")}</datalist><datalist id="mpJobL"></datalist>
      </form></details>
      <details class="mp-fwrap lv" ${isLv ? "open" : ""}><summary>${isLv ? "แก้ไข / ยกเลิกวันลา" : "ลงวันลา"}</summary><form class="mp-form mp-lform" autocomplete="off">
        <fieldset><legend>ประเภทการลา</legend>${LV.map(([v, l]) => `<label class="mp-wt"><input type="radio" name="type" value="${v}" ${isLv && x.type === v ? "checked" : ""} required>${l}</label>`).join("")}</fieldset>
        ${toField}
        <label>หมายเหตุ (ไม่บังคับ)<input name="note" value="${esc(isLv ? x.note || "" : "")}" placeholder="เช่น ไปโรงพยาบาล, ลาครึ่งวันเช้า"></label>
        <div class="mp-chks"><label><input type="checkbox" name="skip" checked> ข้ามวันอาทิตย์ / วันหยุด</label><label><input type="checkbox" name="clear" checked> ลบงานที่ลงไว้ในวันลา</label></div>
        <div class="mp-fbtn"><button type="submit" class="mp-save">บันทึกวันลา</button>${isLv || bulk ? `<button type="button" class="mp-ldel">${bulk ? "ยกเลิกวันลาทั้งหมดในช่องที่เลือก" : "ยกเลิกวันลาวันนี้"}</button>` : ""}</div>
      </form></details>`;
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || r.status);
    return res;
  }
  function wireForms(el, ctx, close) {
    const msg = el.querySelector(".mp-msg");
    const reload = () => { if (DATA) DATA.want = ""; return ensure().then(draw); };
    const who = () => [...el.querySelectorAll("[name=who]:checked")].map(i => i.value);
    const pn = el.querySelector(".mp-pn");
    el.querySelectorAll("[name=who]").forEach(i => i.addEventListener("change", () => { pn.textContent = who().length; }));
    const daysOf = (f) => { const out = []; for (let d = fromKey(ctx.from), e = fromKey(f.to.value || ctx.to); d <= e; d = addDays(d, 1)) out.push(key(d)); return out; };
    const run = async (btn, work, done) => {
      const ids = who();
      if (!ids.length) { msg.textContent = "เลือกคนอย่างน้อย 1 คน"; return; }
      btn.disabled = true; msg.textContent = "กำลังบันทึก…";
      try { const res = await work(ids); msg.textContent = done(res); await reload(); setTimeout(close, 600); }
      catch (err) { msg.textContent = "ไม่สำเร็จ (" + err.message + ")"; btn.disabled = false; }
    };
    const f = el.querySelector(".mp-wform");
    if (f) {
      const jobsFor = () => { const c = lc(f.customer.value); el.querySelector("#mpJobL").innerHTML = DATA.projects.filter(p => !c || lc(p.customer) === c).map(p => `<option value="${esc(p.name)}">${esc(p.job_no || "")}</option>`).join(""); };
      jobsFor();
      f.customer.addEventListener("input", jobsFor);
      f.job.addEventListener("change", () => {
        const hit = DATA.projects.find(p => lc(p.name) === lc(f.job.value) && (!f.customer.value || lc(p.customer) === lc(f.customer.value)));
        if (hit) { if (!f.customer.value) f.customer.value = hit.customer || ""; if (hit.job_no && !f.job_no.value) f.job_no.value = hit.job_no; if (hit.code === "SERVICE" && !f.querySelector("[name=work_type]:checked")) f.querySelector("[value=service]").checked = true; }
      });
      f.addEventListener("submit", e => { e.preventDefault(); run(f.querySelector(".mp-save"), ids => post("/api/manpower/assign", {
        worker_ids: ids, from: ctx.from, to: f.to.value || ctx.to, customer: f.customer.value, job: f.job.value, job_no: f.job_no.value,
        work_type: (f.querySelector("[name=work_type]:checked") || {}).value, note: f.note.value, tentative: f.tentative.checked, skip_off: f.skip.checked }),
        res => `บันทึกแล้ว ${res.saved} ช่อง (${res.people} คน)`); });
      const del = f.querySelector(".mp-del");
      if (del) del.addEventListener("click", () => run(del, ids => post("/api/manpower/clear", { items: ids.map(worker_id => ({ worker_id, days: daysOf(f) })) }), res => `ลบแล้ว ${res.removed} ช่อง`));
    }
    const lf = el.querySelector(".mp-lform");
    if (lf) {
      lf.addEventListener("submit", e => { e.preventDefault(); run(lf.querySelector(".mp-save"), ids => post("/api/manpower/leave", {
        worker_ids: ids, from: ctx.from, to: lf.to.value || ctx.to, type: (lf.querySelector("[name=type]:checked") || {}).value, note: lf.note.value, skip_off: lf.skip.checked, clear_work: lf.clear.checked }),
        res => `บันทึกวันลาแล้ว ${res.saved} วัน${res.removed ? ` · ลบงานที่ลงไว้ ${res.removed} ช่อง` : ""}`); });
      const ld = lf.querySelector(".mp-ldel");
      if (ld) ld.addEventListener("click", () => run(ld, ids => post("/api/manpower/leave-clear", { items: ids.map(worker_id => ({ worker_id, days: daysOf(lf) })) }), res => `ยกเลิกวันลาแล้ว ${res.removed} วัน`));
    }
  }
  // Block dragged on the grid: people × days
  function bulk(ids, from, to) {
    const n = (fromKey(to) - fromKey(from)) / 864e5 + 1;
    const names = ids.map(id => { const w = DATA.workers.find(x => x.id === id); return w ? w.nickname || w.name_th : id; });
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="ลงงานหลายช่อง"><header><div><b>เลือก ${ids.length} คน × ${n} วัน</b><div class="mp-when">${esc(fmtD(from))} – ${esc(fmtD(to))}</div><div class="mp-when">${esc(names.join(", "))}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${editForms({ ids, from, to, bulk: true })}<div class="mp-msg" role="status"></div></div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); clearSel(); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    wireForms(el, { ids, from, to }, close);
    el.querySelector(".mp-x").focus();
  }
  // drag-select (editors): press on a cell, drag across people / days, release → bulk dialog; a plain click opens the cell
  let DRAG = null;
  const clearSel = () => ROOT && ROOT.querySelectorAll("td.sel").forEach(t => t.classList.remove("sel"));
  function dragRect(k1, k2) {
    const [w1, d1] = k1.split("|"), [w2, d2] = k2.split("|"), W = CUR.W, i1 = W.indexOf(w1), i2 = W.indexOf(w2);
    const lo = Math.min(i1, i2), hi = Math.max(i1, i2);
    return { ids: W.slice(lo, hi + 1), from: d1 < d2 ? d1 : d2, to: d1 < d2 ? d2 : d1 };
  }
  function paintSel(r) {
    clearSel();
    const set = new Set(r.ids);
    ROOT.querySelectorAll(".mp-grid tbody td[data-k]").forEach(t => { const [w, d] = t.dataset.k.split("|"); if (set.has(w) && d >= r.from && d <= r.to) t.classList.add("sel"); });
  }
  function bindDrag(g) {
    g.addEventListener("pointerdown", e => {
      const td = e.target.closest("tbody td[data-k]");
      if (!td || e.button !== 0) return;
      DRAG = { k0: td.dataset.k, k1: td.dataset.k, moved: false };
      e.preventDefault();
    });
    g.addEventListener("pointerover", e => {
      if (!DRAG) return;
      const td = e.target.closest("tbody td[data-k]");
      if (!td || td.dataset.k === DRAG.k1) return;
      DRAG.k1 = td.dataset.k; DRAG.moved = DRAG.k1 !== DRAG.k0;
      paintSel(dragRect(DRAG.k0, DRAG.k1));
    });
    const end = () => {
      if (!DRAG) return;
      const d = DRAG; DRAG = null;
      if (!d.moved) { clearSel(); detail(d.k0); return; }
      const r = dragRect(d.k0, d.k1);
      bulk(r.ids, r.from, r.to);
    };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", () => { DRAG = null; clearSel(); });
    if (!window.__mpUp) { window.__mpUp = true; document.addEventListener("pointerup", () => { if (DRAG) { DRAG = null; clearSel(); } }); }
  }

  /* ---------- ข้อมูลหลัก / ประวัติการแก้ไข (SC / PC / SSM) ---------- */
  const pageHead = () => `<div class="mp-head"><div class="mp-title"><h2>วางแผนกำลังคน</h2><nav class="mp-tabs"><a href="#manpower">Planning Board</a><a href="#manpower/data" class="${S.page === "data" ? "on" : ""}">ข้อมูลหลัก</a><a href="#manpower/log" class="${S.page === "log" ? "on" : ""}">ประวัติการแก้ไข</a></nav></div></div>`;
  const STATUS = [["active", "Active"], ["hold", "Hold"], ["postponed", "เลื่อน"], ["cancelled", "ยกเลิก"], ["done", "เสร็จแล้ว"]];
  async function dataPage(box) {
    let M;
    try { const r = await fetch("/api/manpower/master", { cache: "no-store" }); M = await r.json(); if (!r.ok) throw new Error(M.error || r.status); }
    catch (err) { box.innerHTML = `<div class="mp-empty">โหลดข้อมูลไม่สำเร็จ (${esc(err.message)})</div>`; return; }
    const tab = S.dtab || "workers";
    const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    const wRow = w => `<tr data-id="${esc(w ? w.id : "")}"><td><input name="emp_code" value="${esc(w ? w.emp_code || "" : "")}" placeholder="R#####" size="8"></td>
      <td><input name="name_th" value="${esc(w ? w.name_th : "")}" placeholder="ชื่อ นามสกุล" required></td><td><input name="nickname" value="${esc(w ? w.nickname || "" : "")}" size="8"></td>
      <td><select name="unit">${opt(UNITS.map(([u]) => [u, u]), w ? w.unit : "ME")}</select></td><td><input name="trade" value="${esc(w ? w.trade || "" : "")}" placeholder="เช่น ประกอบ" size="10"></td>
      <td><input name="sort" type="number" value="${esc(w ? w.sort : "")}" style="width:70px"></td><td class="c"><input name="active" type="checkbox" ${!w || w.active ? "checked" : ""}></td>
      <td><button type="button" class="mp-rs">${w ? "บันทึก" : "เพิ่มช่าง"}</button></td></tr>`;
    const pRow = p => `<tr data-code="${esc(p ? p.code : "")}"><td><input name="customer" value="${esc(p ? p.customer || "" : "")}" placeholder="ลูกค้า"></td>
      <td><input name="name" value="${esc(p ? p.name : "")}" placeholder="ชื่องาน" required></td><td><input name="job_no" value="${esc(p ? p.job_no || "" : "")}" placeholder="Job no." size="10"></td>
      <td><select name="status">${opt(STATUS, p ? p.status : "active")}</select></td><td><input name="color" type="color" value="${esc(p ? p.color : "#6d7582")}"></td>
      <td><button type="button" class="mp-rs">${p ? "บันทึก" : "เพิ่มงาน"}</button></td></tr>`;
    const years = [...new Set(M.holidays.map(h => h.day.slice(0, 4)))].sort();
    const hBody = `<form class="mp-hadd"><input type="date" name="day" min="2026-01-01" max="2027-12-31" required><input name="name" placeholder="ชื่อวันหยุด เช่น วันสงกรานต์"><select name="type"><option value="PH">PH · วันหยุดนักขัตฤกษ์</option><option value="EX">EX · วันหยุดพิเศษบริษัท</option></select><button type="submit" class="mp-rs">เพิ่มวันหยุด</button></form>
      <p class="mp-hint">วันอาทิตย์เป็นวันหยุดอยู่แล้ว ไม่ต้องเพิ่ม · ปี 2027 รอปฏิทินบริษัทจาก HR</p>
      ${years.map(y => `<h4>${y}</h4><table class="mp-mt"><tbody>${M.holidays.filter(h => h.day.startsWith(y)).map(h => `<tr><td>${esc(fmtD(h.day))}</td><td>${esc(DS[fromKey(h.day).getDay()])}</td><td>${esc(h.type)}</td><td>${esc(h.name || "")}</td><td><button type="button" class="mp-hd" data-day="${esc(h.day)}">ลบ</button></td></tr>`).join("")}</tbody></table>`).join("") || `<p class="mp-hint">ยังไม่มีวันหยุดบริษัท</p>`}`;
    box.innerHTML = `<div class="mp-dtabs">${[["workers", `ช่าง (${M.workers.length})`], ["projects", `งาน / ลูกค้า (${M.projects.length})`], ["holidays", `วันหยุดบริษัท (${M.holidays.length})`]].map(([k, l]) => `<button type="button" data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="mp-card">${tab === "workers" ? `<p class="mp-hint">ใส่รหัสพนักงานให้คนที่ยังไม่มี (รหัส X###) แล้วกดบันทึก ข้อมูลงานและวันลาเดิมจะย้ายตามให้ · เอาติ๊ก "ทำงานอยู่" ออกเมื่อลาออก (ประวัติยังอยู่)</p>
        <table class="mp-mt"><thead><tr><th>รหัสพนักงาน</th><th>ชื่อ-นามสกุล</th><th>ชื่อเล่น</th><th>หน่วยงาน</th><th>ตำแหน่ง</th><th>ลำดับ</th><th>ทำงานอยู่</th><th></th></tr></thead><tbody>${wRow(null)}${M.workers.map(wRow).join("")}</tbody></table>`
      : tab === "projects" ? `<p class="mp-hint">แก้ชื่องาน ลูกค้า Job no. สถานะ และสีที่แสดงบน board · งานใหม่สร้างได้ที่นี่หรือจากฟอร์มลงงาน</p>
        <table class="mp-mt"><thead><tr><th>ลูกค้า</th><th>ชื่องาน</th><th>Job no.</th><th>สถานะ</th><th>สี</th><th></th></tr></thead><tbody>${pRow(null)}${M.projects.map(pRow).join("")}</tbody></table>`
      : hBody}</div><div class="mp-msg mp-pmsg" role="status"></div>`;
    const msg = box.querySelector(".mp-pmsg");
    const done = async (fn, okText) => { msg.textContent = "กำลังบันทึก…"; try { await fn(); msg.textContent = okText; if (DATA) DATA.want = ""; ensure(); dataPage(box).then(() => { box.querySelector(".mp-pmsg").textContent = okText; }); } catch (err) { msg.textContent = "บันทึกไม่สำเร็จ (" + err.message + ")"; } };
    box.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { S.dtab = b.dataset.t; dataPage(box); }));
    box.querySelectorAll("tr[data-id] .mp-rs").forEach(b => b.addEventListener("click", () => { const tr = b.closest("tr"), v = n => tr.querySelector(`[name=${n}]`);
      done(() => post("/api/manpower/master/worker", { id: tr.dataset.id, emp_code: v("emp_code").value.trim(), name_th: v("name_th").value, nickname: v("nickname").value, unit: v("unit").value, trade: v("trade").value, sort: v("sort").value, active: v("active").checked }), tr.dataset.id ? "บันทึกข้อมูลช่างแล้ว" : "เพิ่มช่างแล้ว"); }));
    box.querySelectorAll("tr[data-code] .mp-rs").forEach(b => b.addEventListener("click", () => { const tr = b.closest("tr"), v = n => tr.querySelector(`[name=${n}]`);
      done(() => post("/api/manpower/master/project", { code: tr.dataset.code, customer: v("customer").value, name: v("name").value, job_no: v("job_no").value, status: v("status").value, color: v("color").value }), tr.dataset.code ? "บันทึกงานแล้ว" : "เพิ่มงานแล้ว"); }));
    const hf = box.querySelector(".mp-hadd");
    if (hf) hf.addEventListener("submit", e => { e.preventDefault(); done(() => post("/api/manpower/master/holiday", { day: hf.day.value, name: hf.name.value, type: hf.type.value }), "เพิ่มวันหยุดแล้ว"); });
    box.querySelectorAll(".mp-hd").forEach(b => b.addEventListener("click", () => done(() => post("/api/manpower/master/holiday-delete", { day: b.dataset.day }), "ลบวันหยุดแล้ว")));
  }
  const ACT = { assign: "ลงงาน", clear: "ลบงาน", confirm: "Confirm งานจอง", leave: "ลงวันลา", "leave-clear": "ยกเลิกวันลา", "worker-add": "เพิ่มช่าง", "worker-edit": "แก้ข้อมูลช่าง", "project-add": "เพิ่มงาน", "project-edit": "แก้ข้อมูลงาน", holiday: "เพิ่มวันหยุด", "holiday-delete": "ลบวันหยุด" };
  function logSummary(r) {
    const d = r.detail || {}, nm = id => { const w = DATA.workers.find(x => x.id === id); return w ? w.nickname || w.name_th : id; };
    const span = list => { const s2 = [...new Set(list)].sort(); return s2.length ? (s2.length === 1 ? fmtD(s2[0]) : `${fmtD(s2[0])} – ${fmtD(s2[s2.length - 1])} (${s2.length} วัน)`) : ""; };
    const people = d.workers ? Object.entries(d.workers) : d.items ? d.items.map(i => [i.worker_id, i.days]) : d.worker_id ? [[d.worker_id, d.days || []]] : [];
    const who = people.length ? people.map(([id]) => nm(id)).join(", ") + " · " + span(people.flatMap(([, ds]) => ds)) : "";
    if (r.action === "assign") return `${who} · ${[d.customer, d.job, d.job_no].filter(Boolean).join(" / ")} · ${WTL[d.work_type] || ""}${d.tentative ? " · จอง" : ""}`;
    if (r.action === "clear" || r.action === "leave-clear") return `${who} · ${(d.removed || []).length} ช่อง`;
    if (r.action === "leave") return `${who} · ${(LV.find(x => x[0] === d.type) || [0, d.type])[1]}${d.note ? " · " + d.note : ""}${(d.removed_work || []).length ? ` · ลบงาน ${d.removed_work.length} ช่อง` : ""}`;
    if (r.action === "confirm") return `${(d.items || []).map(i => nm(i.worker_id)).join(", ")} · ${d.newText || d.text} · ${d.cells || 0} ช่อง`;
    if (r.action.startsWith("worker")) return `${d.name_th || ""}${d.newId && d.newId !== d.old_id ? " · รหัส " + (d.old_id ? d.old_id + " → " : "") + d.newId : ""}${d.active === false ? " · ไม่ได้ทำงานแล้ว" : ""}`;
    if (r.action.startsWith("project")) return [d.customer, d.name, d.job_no, d.status].filter(Boolean).join(" / ");
    if (r.action.startsWith("holiday")) return `${fmtD(d.day)} ${d.name || ""}`;
    return "";
  }
  async function logPage(box, before) {
    let rows;
    try { const r = await fetch("/api/manpower/log" + (before ? "?before=" + before : ""), { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); rows = j.rows; }
    catch (err) { box.innerHTML = `<div class="mp-empty">โหลดประวัติไม่สำเร็จ (${esc(err.message)})</div>`; return; }
    const html = rows.map(r => `<tr><td class="nw">${esc(new Date(r.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }))}</td><td>${esc(r.by_user)}</td><td><b class="mp-act-${esc(r.action)}">${esc(ACT[r.action] || r.action)}</b></td><td>${esc(logSummary(r))}</td></tr>`).join("");
    if (!before) box.innerHTML = `<div class="mp-card"><p class="mp-hint">บันทึกทุกการลงงาน แก้ไข ลบ ลงวันลา Confirm และแก้ข้อมูลหลัก ล่าสุดอยู่บนสุด</p><table class="mp-mt mp-log"><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>${html || `<tr><td colspan="4" class="mp-hint">ยังไม่มีการแก้ไข</td></tr>`}</tbody></table><div class="mp-more"></div></div>`;
    else box.querySelector(".mp-log tbody").insertAdjacentHTML("beforeend", html);
    const more = box.querySelector(".mp-more");
    more.innerHTML = rows.length === 100 ? `<button type="button" class="mp-rs">โหลดเพิ่ม</button>` : "";
    const b = more.querySelector("button"); if (b) b.addEventListener("click", () => logPage(box, rows[rows.length - 1].id));
  }

  function draw() {
    if (!ROOT) return;
    if (!DATA) { ROOT.innerHTML = toolbar() + `<div class="mp-empty">${esc(ERR || "กำลังโหลด…")}</div>`; bind(); return; }
    ROOT.classList.toggle("mp-ed", !!DATA.canEdit);
    if (S.page !== "board" && DATA.canEdit) { ROOT.innerHTML = pageHead() + `<div id="mpPage" class="mp-page"><div class="mp-empty">กำลังโหลด…</div></div>`; (S.page === "data" ? dataPage : logPage)(ROOT.querySelector("#mpPage")); return; }
    ROOT.innerHTML = toolbar() + legend() + grid()
      + `<p class="mp-note">ข้อมูลตั้งแต่ 1 ม.ค. 2026 นำเข้าจาก Google Sheet "ตารางงานและวันหยุดช่าง 2569" ครั้งเดียว · งาน SP มาจาก Service Plan (ใบขอคน สถานะ Confirm / Complete)${DATA.serviceUpdated ? " อัปเดต " + esc(new Date(DATA.serviceUpdated).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })) : ""} · กดช่องเพื่อดูรายละเอียด</p>`;
    bind();
    const t = ROOT.querySelector("th.mp-d.td"), sc = ROOT.querySelector(".mp-scroll"), nc = ROOT.querySelector(".mp-corner");
    if (t && sc && nc) sc.scrollLeft = Math.max(0, t.offsetLeft - nc.offsetWidth - 2 * t.offsetWidth);
  }
  function bind() {
    ROOT.querySelectorAll("[data-unit]").forEach(c => c.addEventListener("change", () => { c.checked ? S.units.add(c.dataset.unit) : S.units.delete(c.dataset.unit); draw(); }));
    const c = ROOT.querySelector("#mpCust"); if (c) c.addEventListener("change", () => { S.cust = c.value; S.project = ""; draw(); });
    const p = ROOT.querySelector("#mpProj"); if (p) p.addEventListener("change", () => { S.project = p.value; draw(); });
    const pp = ROOT.querySelector("#mpPerson"); if (pp) pp.addEventListener("change", () => { S.person = pp.value; draw(); });
    const cl = ROOT.querySelector("#mpClr"); if (cl) cl.addEventListener("click", () => { S.cust = S.project = S.person = S.q = ""; draw(); });
    const q = ROOT.querySelector("#mpQ"); if (q) q.addEventListener("change", () => { S.q = q.value.trim(); draw(); });
    const l = ROOT.querySelector("#mpLeft"); if (l) l.addEventListener("change", () => { S.left = l.checked; draw(); });
    const m = ROOT.querySelector("#mpMiles"); if (m) m.addEventListener("change", () => { S.miles = m.checked; draw(); });
    ROOT.querySelectorAll(".mp-lg[data-p]").forEach(b => b.addEventListener("click", () => { const on = S.project === b.dataset.p; S.project = on ? "" : b.dataset.p; S.cust = on ? "" : custOf(b.dataset.p); draw(); }));
    const g = ROOT.querySelector(".mp-grid");
    if (g && DATA && DATA.canEdit) bindDrag(g);
    else if (g) g.addEventListener("click", e => { const td = e.target.closest("td[data-k]"); if (td) detail(td.dataset.k); });
  }

  function mount(el, sub) {
    if (!document.getElementById("mpCss")) { const s = document.createElement("style"); s.id = "mpCss"; s.textContent = CSS; document.head.appendChild(s); }
    ROOT = el;
    const [z, k] = String(sub || "").split("/");
    if (ZOOMS.some(x => x[0] === z)) S.zoom = z;
    S.page = z === "data" || z === "log" ? z : "board";
    if (S.page === "board") S.date = clampDate(fromKey(k) || (sub ? S.date : today()));
    draw();
    ensure().then(draw);
  }

  const CSS = `
.mp-root{display:grid;gap:14px}
.mp-head{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:grid;gap:10px}
.mp-title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mp-title h2{margin:0;font-size:19px;font-weight:600}
.mp-badge{font-size:11px;border-radius:999px;padding:2px 10px;background:#eef0f3;color:var(--muted)}.mp-badge.ed{background:var(--green-soft);color:var(--green)}
.mp-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mp-nav b{font-size:15px;margin:0 6px;font-weight:600}
.mp-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 12px;text-decoration:none;color:var(--ink)}.mp-btn:hover{border-color:#f0b9b9;color:var(--rak)}
.mp-zoom{margin-left:auto;display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.mp-zoom a{padding:4px 12px;text-decoration:none;color:var(--muted);font-size:13px}.mp-zoom a.on{background:var(--rak);color:#fff}
.mp-filters{display:flex;gap:8px 14px;align-items:center;flex-wrap:wrap;font-size:13px}
.mp-filters select,.mp-filters input[type=search]{font:inherit;font-size:13px;border:1px solid #dce1e8;border-radius:8px;padding:4px 10px;max-width:260px}
.mp-chk{display:inline-flex;gap:5px;align-items:center;color:#4a515c;cursor:pointer}
.mp-legend{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:12px}
.mp-lt{color:var(--muted);margin-right:4px}
.mp-lg{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:2px 10px;color:#4a515c;font-size:12px}
button.mp-lg:hover,.mp-lg.on{border-color:var(--rak);color:var(--rak)}.mp-lg b{font-weight:600}
.mp-lg i,.mp-dot{display:inline-block;width:10px;height:10px;border-radius:3px}
.tent-i{background:repeating-linear-gradient(135deg,#999 0 2px,#fff 2px 4px)}.lv-i{background:#ffe7b0}.off-i{background:#e4e7ec}
.mp-scroll{overflow:auto;max-height:calc(100vh - 230px);background:#fff;border:1px solid var(--line);border-radius:12px}
.mp-grid{border-collapse:separate;border-spacing:0;font-size:11px;min-width:100%}
.mp-grid th,.mp-grid td{border-right:1px solid #eef0f3;border-bottom:1px solid #eef0f3;padding:0}
.mp-grid thead th{position:sticky;background:#fff;z-index:3}
.mp-grid thead tr:first-child th{top:0;height:24px}.mp-grid thead tr:nth-child(2) th{top:24px}
.mp-mon{font-weight:600;font-size:12px;text-align:left;padding:2px 0!important;color:#424a57}.mp-mon span{position:sticky;left:178px;padding:0 8px}
.mp-d{font-weight:500;color:#4a515c;text-align:center;line-height:1.15;padding:3px 0!important}.mp-d span{display:block;font-size:9.5px;color:#9aa1ab;font-weight:400}
.mp-d.we{background:#f3f4f6!important}.mp-d.td{background:var(--rak)!important;color:#fff}.mp-d.td span{color:#ffd9d9}
.mp-name{position:sticky;left:0;z-index:2;background:#fff;text-align:left;min-width:170px;max-width:170px;padding:3px 10px!important;font-weight:400;border-right:1px solid var(--line)!important}
.mp-corner{z-index:4!important;vertical-align:bottom}
.mp-name b{display:block;font-weight:600;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-name small{display:block;font-size:10px;color:#9aa1ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-name.left b{color:#9aa1ab;text-decoration:line-through}
.mp-grp th,.mp-grp td{background:#f7f8fa!important;height:26px}.mp-grp th{font-weight:600;font-size:12px;color:#424a57;padding:4px 10px!important;text-align:left;white-space:nowrap}
.mp-grp th span{font-weight:400;color:var(--muted);margin-left:6px}
.mp-ms .mp-name{font-size:11.5px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.mp-ms .mp-name i{width:9px;height:9px;border-radius:2px;flex:none}.mp-ms .mp-name em{font-style:normal;font-size:10px;color:var(--amber)}
.mp-c{height:34px;vertical-align:middle;text-align:center;position:relative}
.mp-c.we{background:#f7f8fa}.mp-c.td{box-shadow:inset 2px 0 0 var(--rak),inset -2px 0 0 var(--rak)}
.mp-c[data-k]{cursor:pointer}
.mp-c.job{background:color-mix(in srgb,var(--c) 17%,#fff);box-shadow:inset 3px 0 0 var(--c)}
.mp-c.job.tent{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,#fff) 0 5px,#fff 5px 9px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,#fff)}
.mp-c.dim{background:repeating-linear-gradient(135deg,#f3f4f6 0 3px,#fff 3px 6px)}
.mp-c span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0 3px;line-height:1.25;color:#2b3038;overflow-wrap:anywhere}
.mp-c.ab span{font-size:10px;font-weight:600}
.mp-c.ab.off{background:#eceef2}.mp-c.ab.off span{color:#8b939f}
.mp-c.ab.ph{background:#fde3e3}.mp-c.ab.ph span{color:var(--rak)}
.mp-c.ab.lv{background:#fff1cc}.mp-c.ab.lv span{color:var(--amber)}
.mp-c.ms{background:color-mix(in srgb,var(--c) 12%,#fff)}.mp-c.ms span{font-weight:600;color:var(--c);font-size:10px}
.mp-z-week .mp-c,.mp-z-week .mp-d{min-width:104px;max-width:104px}.mp-z-week .mp-c{height:44px}.mp-z-week .mp-c span{-webkit-line-clamp:3}
.mp-z-month .mp-c,.mp-z-month .mp-d{min-width:58px;max-width:58px}.mp-z-month .mp-c span{font-size:9.5px}
.mp-z-quarter .mp-c,.mp-z-quarter .mp-d{min-width:22px;max-width:22px}.mp-z-quarter .mp-c.job{background:color-mix(in srgb,var(--c) 42%,#fff);box-shadow:none}.mp-z-quarter .mp-c.job.tent{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 42%,#fff) 0 3px,#fff 3px 6px)}.mp-z-quarter .mp-c.ms{background:var(--c)}.mp-z-quarter .mp-c{height:26px}.mp-z-quarter .mp-c.job span,.mp-z-quarter .mp-c.ms span{display:none}.mp-z-quarter .mp-c.ab span{font-size:8.5px}
.mp-grid tfoot th,.mp-grid tfoot td{position:sticky;background:#fff;font-weight:600;font-size:11px}
.mp-grid tfoot tr:nth-child(1) th,.mp-grid tfoot tr:nth-child(1) td{bottom:52px;border-top:2px solid var(--line)}
.mp-grid tfoot tr:nth-child(2) th,.mp-grid tfoot tr:nth-child(2) td{bottom:26px}
.mp-grid tfoot tr:nth-child(3) th,.mp-grid tfoot tr:nth-child(3) td{bottom:0}
.mp-grid tfoot .mp-c{height:26px}.mp-grid tfoot th.mp-name{z-index:3}
.mp-sum.w td{color:var(--green)}.mp-sum.l td{color:var(--amber)}.mp-sum.f td{color:var(--rak)}
.mp-empty{background:#fff;border:1px dashed var(--line);border-radius:12px;padding:28px;text-align:center;color:var(--muted)}
.mp-note{margin:0;font-size:12px;color:var(--muted)}
.mp-modal{position:fixed;inset:0;background:rgba(18,20,24,.45);display:grid;place-items:center;padding:16px;z-index:60}
.mp-dlg{background:#fff;border-radius:14px;width:min(460px,100%);box-shadow:0 24px 60px -20px rgba(0,0,0,.45)}
.mp-dlg header{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.mp-dlg header span{color:var(--muted);font-size:12.5px}.mp-when{font-size:12.5px;color:#4a515c;margin-top:2px}
.mp-x{border:0;background:#f3f4f6;border-radius:8px;width:30px;height:30px;flex:none}
.mp-dl{display:grid;grid-template-columns:90px 1fr;gap:6px 12px;margin:0;padding:14px 16px}.mp-dl dt{color:var(--muted)}.mp-dl dd{margin:0;display:flex;gap:6px;align-items:center}
.mp-sp{position:absolute;top:1px;right:1px;font-size:8px;line-height:1;font-weight:700;color:#fff;background:var(--c,#2f6fd6);border-radius:3px;padding:2px 3px}
.mp-sp.x{background:var(--rak)}.mp-sp.in{position:static;display:inline-block;background:#2f6fd6;margin-right:4px}.mp-sp.x.in{background:var(--rak)}
.mp-c.sv{box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,#fff)}
.mp-z-quarter .mp-sp{display:none}
.mp-um{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12px;color:#4a515c}
.mp-um summary{cursor:pointer;color:var(--amber);font-weight:600}.mp-um ul{margin:8px 0;padding-left:18px;max-height:220px;overflow:auto}.mp-um li{margin:2px 0}.mp-um p{margin:4px 0 0;color:var(--muted)}
.mp-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);background:#f7fbf8}
.mp-act>span{font-weight:600;font-size:13px;width:100%}.mp-act small{width:100%;color:var(--muted);font-size:11.5px}
.mp-ok{border:1px solid var(--green);background:#fff;color:var(--green);border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.mp-ok:hover{background:var(--green);color:#fff}.mp-ok:disabled{opacity:.5;cursor:wait}
.mp-ro{margin:0;padding:0 16px 12px;font-size:12px;color:var(--muted)}
.mp-svd{border-top:1px solid var(--line)}.mp-svd h4{margin:12px 16px 0;font-size:13px}.mp-svd .mp-dl{padding-bottom:8px}
.mp-msg{padding:0 16px 12px;font-size:12.5px;color:var(--green)}.mp-msg:empty{display:none}
.mp-dlg{max-height:calc(100vh - 32px);overflow:auto}
.mp-fl{display:inline-flex;align-items:center;gap:4px}.mp-fl i{font-style:normal;color:var(--muted)}
.mp-clr{border:0;background:none;color:var(--rak);font:inherit;font-size:13px;cursor:pointer;padding:0}
.mp-c.ed:hover{background:#fff6f6;box-shadow:inset 0 0 0 1px #f0b9b9;cursor:copy}
.mp-fwrap{border-top:1px solid var(--line)}.mp-fwrap summary{cursor:pointer;padding:12px 16px;font-weight:600;font-size:13.5px;color:var(--rak)}
.mp-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;padding:0 16px 14px;font-size:12.5px;color:#4a515c}
.mp-form label{display:grid;gap:4px;min-width:0}.mp-form input{box-sizing:border-box;width:100%;min-width:0}.mp-form input[type=radio],.mp-form input[type=checkbox]{width:auto}.mp-form label.wide,.mp-form fieldset,.mp-chks,.mp-fbtn{grid-column:1/-1}
.mp-form input[type=text],.mp-form input:not([type]),.mp-form input[type=date]{font:inherit;font-size:13.5px;border:1px solid #dce1e8;border-radius:8px;padding:6px 10px;color:var(--ink)}
.mp-form fieldset{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}.mp-form legend{padding:0;margin-bottom:4px}
.mp-wt{display:inline-flex!important;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;font-size:13px}
.mp-wt:has(input:checked){border-color:var(--rak);background:#fff1f1;color:var(--rak)}.mp-wt input{margin:0}
.mp-chks{display:flex;flex-wrap:wrap;gap:6px 16px}.mp-chks label{display:inline-flex;align-items:center;gap:6px}
.mp-fbtn{display:flex;gap:8px}.mp-save{background:var(--rak);color:#fff;border:0;border-radius:8px;padding:8px 18px;font:inherit;font-weight:600;cursor:pointer}
.mp-fwrap.lv summary{color:var(--amber)}.mp-lform .mp-wt:has(input:checked){border-color:var(--amber);background:#fff6e0;color:var(--amber)}.mp-lform .mp-save{background:var(--amber)}
.mp-ldel,.mp-del{background:#fff;color:var(--rak);border:1px solid #f0b9b9;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.mp-save:disabled,.mp-del:disabled{opacity:.5}
@media (max-width:640px){.mp-form{grid-template-columns:1fr}}
.mp-grid td.sel{box-shadow:inset 0 0 0 2px var(--rak)!important;background:#ffe9e9!important}
.mp-ed .mp-grid{user-select:none;-webkit-user-select:none}.mp-ed .mp-grid tbody td[data-k]{cursor:cell;touch-action:pan-x pan-y}
.mp-pick{border-top:1px solid var(--line)}.mp-pick summary{cursor:pointer;padding:10px 16px;font-size:13px;color:#4a515c}.mp-pick summary b{color:var(--rak)}
.mp-pl{padding:0 16px 10px;display:grid;gap:8px;max-height:260px;overflow:auto}
.mp-pl fieldset{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px}.mp-pl legend{font-weight:600;font-size:12px;color:var(--muted);margin-bottom:2px}
.mp-pl label{display:inline-flex;gap:4px;align-items:center}
.mp-tabs{display:inline-flex;gap:4px;background:#f3f4f6;border-radius:9px;padding:3px}.mp-tabs a{padding:4px 12px;border-radius:7px;text-decoration:none;color:#5d6572;font-size:13px}.mp-tabs a.on{background:#fff;color:var(--rak);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.mp-btn.off{opacity:.35;pointer-events:none}
.mp-page{display:grid;gap:12px}.mp-dtabs{display:flex;gap:6px;flex-wrap:wrap}.mp-dtabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}.mp-dtabs button.on{border-color:var(--rak);color:var(--rak);background:#fff1f1;font-weight:600}
.mp-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto}
.mp-mt{border-collapse:collapse;font-size:12.5px;width:100%}.mp-mt th{text-align:left;color:var(--muted);font-weight:500;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
.mp-mt td{padding:4px 6px;border-bottom:1px solid #f0f1f4;vertical-align:middle}.mp-mt td.c{text-align:center}.mp-mt td.nw{white-space:nowrap}
.mp-mt input,.mp-mt select,.mp-hadd input,.mp-hadd select{font:inherit;font-size:12.5px;border:1px solid #dce1e8;border-radius:6px;padding:4px 6px;max-width:100%}
.mp-mt input[name=name_th],.mp-mt input[name=name]{min-width:180px}.mp-mt input[type=color]{padding:0;width:40px;height:26px}
.mp-mt tbody tr:first-child{background:#fbfcf8}
.mp-rs{border:1px solid var(--rak);background:#fff;color:var(--rak);border-radius:7px;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}.mp-rs:hover{background:var(--rak);color:#fff}
.mp-hd{border:0;background:none;color:var(--muted);cursor:pointer;font:inherit;font-size:12px}.mp-hd:hover{color:var(--rak)}
.mp-hadd{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mp-hint{font-size:12px;color:var(--muted);margin:6px 0 10px}.mp-card h4{margin:14px 0 4px;font-size:13px}
.mp-pmsg{padding:0;font-size:13px}.mp-more{padding-top:10px}
@media (max-width:640px){.mp-legend{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.mp-lg{white-space:nowrap;flex:none}.mp-mon span{left:120px}.mp-name{min-width:112px;max-width:112px}.mp-name small{display:none}.mp-zoom{margin-left:0}.mp-scroll{max-height:none}}
`;

  window.Manpower = { mount, _range: range, _state: S };
})();
