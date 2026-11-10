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
    "พักร้อน": ["พร", "lv", "พักร้อน"], "ลาป่วย": ["ป่วย", "lv", "ลาป่วย"], "ลาป่วยครึ่งวัน": ["ป่วย½", "lv", "ลาป่วยครึ่งวัน"],
    "ลากิจ": ["กิจ", "lv", "ลากิจ"], "ลาไม่รับค่าจ้าง": ["ไม่รับ", "lv", "ลาไม่รับค่าจ้าง"], "ลา": ["ลา", "lv", "ลา"],
    "สลับวันหยุด": ["สลับ", "off", "สลับวันหยุด"],
  };
  const KIND = { admin: ["#6d7582", "ประชุม / อบรม / ธุรการ"], internal: ["#9a7b4f", "งานภายใน"], other: ["#b3b8c2", "อื่นๆ (ตรวจสอบ)"] };

  let ROOT = null, DATA = null, LOADING = null, ERR = "";
  const S = { zoom: "month", date: new Date(), units: new Set(UNITS.map(u => u[0])), cust: "", project: "", person: "", q: "", left: false, miles: true };
  const WT = [["fab", "Fab"], ["assembly", "Assembly"], ["install", "Install"], ["service", "Service"], ["other", "Other"]];
  const WTL = Object.fromEntries(WT);

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
      <div class="mp-title"><h2>วางแผนกำลังคน</h2><span class="mp-badge ${can ? "ed" : ""}">${can ? "SC / PC / SSM · ลงงาน / แก้ไข / Confirm ได้" : "ดูอย่างเดียว"}</span></div>
      <div class="mp-nav"><a class="mp-btn" href="${href(S.zoom, step(-1))}" aria-label="ก่อนหน้า">‹</a><a class="mp-btn" href="${href(S.zoom, today())}">วันนี้</a><a class="mp-btn" href="${href(S.zoom, step(1))}" aria-label="ถัดไป">›</a><b>${esc(title())}</b><span class="mp-zoom">${zoom}</span></div>
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
    // people grouped by unit
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
      : x ? `<dl class="mp-dl"><dt>ประเภท</dt><dd>${esc((ABS[x.type] || [0, 0, x.type])[2])}</dd></dl>` : "";
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
    // ---- add / edit work (SC / PC / SSM) ----
    let form = "";
    if (DATA.canEdit) {
      const pj = a && a.project_code ? DATA.P.get(a.project_code) : null;
      const cust = pj ? pj.customer || "" : (S.cust || ""), job = pj ? pj.name : "", jno = pj ? pj.job_no || "" : "";
      const wt = a ? (a.work_type || "other") : (pj && pj.code === "SERVICE" ? "service" : "");
      const note = a && pj && a.text !== pj.name ? a.text.replace(/^จอง\s*/, "") : (a && !pj ? a.text : "");
      form = `<details class="mp-fwrap" ${a ? "" : "open"}><summary>${a ? "แก้ไขงานวันนี้" : "ลงงาน"}</summary><form class="mp-form" autocomplete="off">
        <label>ลูกค้า<input name="customer" list="mpCustL" value="${esc(cust)}" placeholder="เช่น UCT, Ham-Let, SMT" required></label>
        <label>ชื่องาน<input name="job" list="mpJobL" value="${esc(job)}" placeholder="เลือกงานเดิมหรือพิมพ์ชื่องานใหม่" required></label>
        <label>Job no.<input name="job_no" value="${esc(jno)}" placeholder="เช่น 04002026"></label>
        <fieldset><legend>ประเภทงาน</legend>${WT.map(([v, l]) => `<label class="mp-wt"><input type="radio" name="work_type" value="${v}" ${wt === v ? "checked" : ""} required>${l}</label>`).join("")}</fieldset>
        <label class="wide">รายละเอียด (ไม่บังคับ)<input name="note" value="${esc(note)}" placeholder="เช่น ประกอบถัง T-05, เดินสายตู้ MCC"></label>
        <label>ถึงวันที่<input type="date" name="to" value="${esc(day)}" min="${esc(day)}"></label>
        <div class="mp-chks"><label><input type="checkbox" name="skip" checked> ข้ามวันอาทิตย์ / วันหยุด / วันลา</label><label><input type="checkbox" name="tentative" ${a && a.tentative ? "checked" : ""}> จอง (ยังไม่ยืนยัน)</label></div>
        <div class="mp-fbtn"><button type="submit" class="mp-save">บันทึก</button>${a ? `<button type="button" class="mp-del">ลบงานวันนี้</button>` : ""}</div>
        <datalist id="mpCustL">${customers().map(c => `<option value="${esc(c)}">`).join("")}</datalist><datalist id="mpJobL"></datalist>
      </form></details>`;
    }
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="รายละเอียด"><header><div><b>${esc(w ? (w.nickname || w.name_th) : wid)}</b> <span>${esc(w ? w.name_th : "")}</span><div class="mp-when">${DS[d.getDay()]}. ${d.getDate()} ${MF[d.getMonth()]} ${d.getFullYear()}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${body}${actions}${form}<div class="mp-msg" role="status"></div></div>`;
    const reload = () => { if (DATA) DATA.want = ""; return ensure().then(draw); };
    const f = el.querySelector(".mp-form");
    if (f) {
      const jobsFor = () => { const c = lc(f.customer.value); el.querySelector("#mpJobL").innerHTML = DATA.projects.filter(p => !c || lc(p.customer) === c).map(p => `<option value="${esc(p.name)}">${esc(p.job_no || "")}</option>`).join(""); };
      jobsFor();
      f.customer.addEventListener("input", jobsFor);
      f.job.addEventListener("change", () => {
        const hit = DATA.projects.find(p => lc(p.name) === lc(f.job.value) && (!f.customer.value || lc(p.customer) === lc(f.customer.value)));
        if (hit) { if (!f.customer.value) f.customer.value = hit.customer || ""; if (hit.job_no && !f.job_no.value) f.job_no.value = hit.job_no; if (hit.code === "SERVICE" && !f.querySelector("[name=work_type]:checked")) f.querySelector("[value=service]").checked = true; }
      });
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const msg = el.querySelector(".mp-msg"), btn = f.querySelector(".mp-save");
        btn.disabled = true; msg.textContent = "กำลังบันทึก…";
        try {
          const r = await fetch("/api/manpower/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
            worker_id: wid, from: day, to: f.to.value || day, customer: f.customer.value, job: f.job.value, job_no: f.job_no.value,
            work_type: (f.querySelector("[name=work_type]:checked") || {}).value, note: f.note.value, tentative: f.tentative.checked, skip_off: f.skip.checked }) });
          const res = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(res.error || r.status);
          msg.textContent = `บันทึกแล้ว ${res.saved} วัน`;
          await reload(); setTimeout(close, 500);
        } catch (err) { msg.textContent = "บันทึกไม่สำเร็จ (" + err.message + ")"; btn.disabled = false; }
      });
      const del = f.querySelector(".mp-del");
      if (del) del.addEventListener("click", async () => {
        const msg = el.querySelector(".mp-msg"); del.disabled = true; msg.textContent = "กำลังลบ…";
        try {
          const r = await fetch("/api/manpower/clear", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ worker_id: wid, days: [day] }) });
          if (!r.ok) throw new Error(r.status);
          await reload(); close();
        } catch (err) { msg.textContent = "ลบไม่สำเร็จ (" + err.message + ")"; del.disabled = false; }
      });
    }
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

  function draw() {
    if (!ROOT) return;
    if (!DATA) { ROOT.innerHTML = toolbar() + `<div class="mp-empty">${esc(ERR || "กำลังโหลด…")}</div>`; bind(); return; }
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
    const g = ROOT.querySelector(".mp-grid"); if (g) g.addEventListener("click", e => { const td = e.target.closest("td[data-k]"); if (td) detail(td.dataset.k); });
  }

  function mount(el, sub) {
    if (!document.getElementById("mpCss")) { const s = document.createElement("style"); s.id = "mpCss"; s.textContent = CSS; document.head.appendChild(s); }
    ROOT = el;
    const [z, k] = String(sub || "").split("/");
    if (ZOOMS.some(x => x[0] === z)) S.zoom = z;
    S.date = fromKey(k) || (sub ? S.date : today());
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
.mp-del{background:#fff;color:var(--rak);border:1px solid #f0b9b9;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.mp-save:disabled,.mp-del:disabled{opacity:.5}
@media (max-width:640px){.mp-form{grid-template-columns:1fr}}
@media (max-width:640px){.mp-legend{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.mp-lg{white-space:nowrap;flex:none}.mp-mon span{left:120px}.mp-name{min-width:112px;max-width:112px}.mp-name small{display:none}.mp-zoom{margin-left:0}.mp-scroll{max-height:none}}
`;

  window.Manpower = { mount, _range: range, _state: S };
})();
